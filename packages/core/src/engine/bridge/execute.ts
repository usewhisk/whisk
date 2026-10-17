/**
 * Bridge executor.
 *
 * Drives a CCTP V2 Fast Transfer from start to finish:
 *
 *   1. switch wallet to source chain
 *   2. approve USDC + depositForBurnWithHook (one batch if the wallet
 *      supports EIP-5792, otherwise two sequential calls)
 *   3. poll Iris for attestation + forwarder state
 *   4. mint on destination — by Circle's Orbit forwarder by default,
 *      or by the user's wallet if the forwarder was disabled or
 *      reported FAILED
 *
 * The function never throws — every failure path resolves to a typed
 * {@link SendResult} with `kind: "failure"` so the UI has the full step
 * timeline plus a recovery snapshot.
 */
import {
  buildBurnIntent,
  buildMintIntent,
  pollMessages,
  type BurnFeeTier,
  type EvmCctpChain,
  type CctpNetwork,
  type ForwarderFeeTier,
  type IrisMessage,
} from "@usewhisk/cctp";
import { toWhiskError, WhiskError } from "../../errors/errors.js";
import type { Step, StepName } from "../../types/step.js";
import type {
  EvmAdapter,
  EvmCall,
  SendFailure,
  SendListeners,
  SendResult,
} from "../types.js";

export type ExecuteBridgeInput = {
  network: CctpNetwork;
  source: EvmCctpChain;
  destination: EvmCctpChain;
  /** Recipient address on the destination chain. */
  recipientAddress: string;
  /** USDC subunits to burn on the source chain. */
  burnAmount: bigint;
  /** `maxFee` cap to pack into the burn call. */
  maxFee: bigint;
  /** Pre-computed burnFee component (informational, returned in the result). */
  burnFee: bigint;
  /** Pre-computed forwarderFee component (informational). */
  forwarderFee: bigint;
  /** Fee tier — preserved for re-encoding on retry. */
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  /** Default `true`. When `false`, the user must mint manually. */
  useForwarder?: boolean;
  /**
   * Optional integrator-fee transfer calls — prepended to the
   * source-chain call list (merchant share first, treasury share
   * second). Bundled with approve+burn when the wallet supports
   * EIP-5792.
   */
  customFeeCalls?: EvmCall[];
  /** Source-chain wallet adapter (signs the burn + approve). */
  sourceAdapter: EvmAdapter;
  /**
   * Destination-chain wallet adapter — required only when `useForwarder`
   * is `false` or the Forwarder reports `FAILED`. Same wallet typically
   * serves both roles in v1; future versions may split them.
   */
  destinationAdapter?: EvmAdapter;
  /** Iris poll interval (ms). Default 3000. */
  pollIntervalMs?: number;
  /** Iris poll timeout (ms). Default 15 minutes. */
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

/**
 * Snapshot stored on `SendFailure.raw` so the recovery layer can
 * reconstruct the bridge state and resume from the failed step.
 */
export type BridgeRecoverySnapshot = {
  kind: "bridge";
  network: CctpNetwork;
  sourceDomain: number;
  destinationDomain: number;
  burnTxHash?: `0x${string}`;
  message?: `0x${string}`;
  attestation?: `0x${string}`;
  forwardTxHash?: string;
  burnAmount: string;
  maxFee: string;
  recipientAddress: string;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeBridge(
  input: ExecuteBridgeInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  const useForwarder = input.useForwarder ?? true;
  const steps: Step[] = ALL_STEPS.map((name) => ({ name, state: "pending" }));
  const snapshot: BridgeRecoverySnapshot = {
    kind: "bridge",
    network: input.network,
    sourceDomain: input.source.cctpDomain,
    destinationDomain: input.destination.cctpDomain,
    burnAmount: input.burnAmount.toString(),
    maxFee: input.maxFee.toString(),
    recipientAddress: input.recipientAddress,
  };

  // ---- build burn intent --------------------------------------------------
  let burnCalls: EvmCall[];
  try {
    const intent = buildBurnIntent({
      source: input.source,
      destination: input.destination,
      amount: input.burnAmount,
      mintRecipient: input.recipientAddress,
      fee: {
        tier: input.tier,
        ...(input.forwarderLevel !== undefined && {
          forwarderLevel: input.forwarderLevel,
        }),
      },
      withForwarder: useForwarder,
    });
    burnCalls = intent.calls.map((c) => ({
      to: c.to,
      data: c.data,
      value: c.value,
    }));
  } catch (cause) {
    return fail(
      steps,
      "approve",
      cause,
      "Failed to build burn intent.",
      snapshot,
    );
  }

  // Prepend the optional integrator-fee transfers so they ship in the
  // same batch as approve + burn.
  const customFeeCalls = input.customFeeCalls ?? [];
  const submittedCalls: EvmCall[] = [...customFeeCalls, ...burnCalls];
  const customFeeOffset = customFeeCalls.length;

  // ---- switch chain -------------------------------------------------------
  try {
    const live = await input.sourceAdapter.getChainId();
    if (live !== input.source.evmChainId) {
      await input.sourceAdapter.switchChain(input.source.evmChainId);
    }
  } catch (cause) {
    return fail(
      steps,
      "approve",
      cause,
      "Failed to switch to source chain.",
      snapshot,
    );
  }

  // ---- submit approve + burn ---------------------------------------------
  // burnCalls is [approve, burn] (or [burn] when skipApprove is true,
  // which the engine never sets today). When customFee is set,
  // submittedCalls is [customFee, approve, burn].
  const hasApprove = burnCalls.length === 2;
  let approveHash: `0x${string}` | undefined;
  let burnHash: `0x${string}`;
  const customFeeHashes: `0x${string}`[] = [];
  try {
    const { hashes } = await input.sourceAdapter.sendCalls(submittedCalls);
    if (hashes.length === 0) {
      return fail(
        steps,
        hasApprove ? "approve" : "burn",
        new Error("Source adapter returned no transaction hash."),
        "Source adapter returned no transaction hash.",
        snapshot,
      );
    }
    if (hashes.length === 1) {
      // EIP-5792 batched everything into a single bundle.
      burnHash = hashes[0] as `0x${string}`;
      if (hasApprove) approveHash = burnHash;
      if (customFeeOffset > 0) customFeeHashes.push(burnHash);
    } else {
      for (let i = 0; i < customFeeOffset; i++) {
        customFeeHashes.push(hashes[i] as `0x${string}`);
      }
      if (hasApprove) {
        approveHash = hashes[customFeeOffset] as `0x${string}`;
      }
      burnHash = hashes[hashes.length - 1] as `0x${string}`;
    }
  } catch (cause) {
    return fail(
      steps,
      hasApprove ? "approve" : "burn",
      cause,
      "Failed to submit burn.",
      snapshot,
    );
  }

  // Sequential wallets: wait for each customFee receipt before the
  // approve step advances. Bundled wallets share `burnHash` here, so
  // the burn-receipt wait below covers them all in one go.
  for (const hash of customFeeHashes) {
    if (hash === burnHash) continue;
    try {
      const receipt = await input.sourceAdapter.waitForReceipt(hash);
      if (receipt.status === "reverted") {
        return fail(
          steps,
          "approve",
          new Error(`Merchant fee transfer reverted on-chain (${hash}).`),
          "Merchant fee transfer reverted on-chain.",
          snapshot,
          "reverted_onchain",
        );
      }
    } catch (cause) {
      return fail(
        steps,
        "approve",
        cause,
        "Failed waiting for merchant fee receipt.",
        snapshot,
      );
    }
  }

  if (hasApprove && approveHash) {
    if (approveHash === burnHash) {
      steps[0] = { name: "approve", state: "success", txHash: approveHash };
    } else {
      steps[0] = { name: "approve", state: "pending", txHash: approveHash };
      listeners?.onStep?.(steps[0]);
      try {
        const receipt = await input.sourceAdapter.waitForReceipt(approveHash);
        if (receipt.status === "reverted") {
          return fail(
            steps,
            "approve",
            new Error(`Approve reverted on-chain (${approveHash}).`),
            "Approve reverted on-chain.",
            { ...snapshot, burnTxHash: approveHash },
            "reverted_onchain",
          );
        }
        steps[0] = { name: "approve", state: "success", txHash: approveHash };
      } catch (cause) {
        return fail(
          steps,
          "approve",
          cause,
          "Failed waiting for approve receipt.",
          snapshot,
        );
      }
    }
    listeners?.onStep?.(steps[0]);
  } else {
    steps[0] = { name: "approve", state: "noop" };
    listeners?.onStep?.(steps[0]);
  }

  // ---- burn receipt ------------------------------------------------------
  snapshot.burnTxHash = burnHash;
  steps[1] = { name: "burn", state: "pending", txHash: burnHash };
  listeners?.onStep?.(steps[1]);
  try {
    const receipt = await input.sourceAdapter.waitForReceipt(burnHash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "burn",
        new Error(`Burn reverted on-chain (${burnHash}).`),
        "Burn reverted on-chain.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed waiting for burn receipt.",
      snapshot,
    );
  }
  steps[1] = { name: "burn", state: "success", txHash: burnHash };
  listeners?.onStep?.(steps[1]);

  // ---- fetch attestation -------------------------------------------------
  steps[2] = { name: "fetchAttestation", state: "pending" };
  listeners?.onStep?.(steps[2]);
  let message: IrisMessage | null;
  try {
    message = await pollMessages(
      {
        sourceDomain: input.source.cctpDomain,
        transactionHash: burnHash,
      },
      {
        network: input.network,
        ...(input.fetch && { fetch: input.fetch }),
        ...(input.pollIntervalMs !== undefined && {
          intervalMs: input.pollIntervalMs,
        }),
        ...(input.pollTimeoutMs !== undefined && {
          timeoutMs: input.pollTimeoutMs,
        }),
      },
    );
  } catch (cause) {
    return fail(
      steps,
      "fetchAttestation",
      cause,
      "Failed to fetch attestation.",
      snapshot,
    );
  }
  if (!message) {
    return fail(
      steps,
      "fetchAttestation",
      new Error("Timed out waiting for the attestation."),
      "Timed out waiting for the attestation.",
      snapshot,
      "polling_timeout",
    );
  }
  if (message.status === "failed") {
    return fail(
      steps,
      "fetchAttestation",
      new Error(
        `Iris reported attestation failure: ${message.delayReason ?? "no reason given"}.`,
      ),
      "Iris reported attestation failure.",
      snapshot,
      "failed_offchain",
    );
  }
  snapshot.message = message.message;
  snapshot.attestation = message.attestation;
  steps[2] = { name: "fetchAttestation", state: "success" };
  listeners?.onStep?.(steps[2]);

  // ---- mint ---------------------------------------------------------------
  const forwarderHandled =
    useForwarder &&
    message.forwardState === "COMPLETE" &&
    message.forwardTxHash;
  const forwarderFailed = useForwarder && message.forwardState === "FAILED";

  if (forwarderHandled) {
    snapshot.forwardTxHash = message.forwardTxHash ?? undefined;
    steps[3] = {
      name: "mint",
      state: "success",
      forwarded: true,
      txHash: message.forwardTxHash ?? undefined,
    };
    listeners?.onStep?.(steps[3]);
    return {
      kind: "success",
      ...(message.forwardTxHash && { finalTxHash: message.forwardTxHash }),
      steps,
    };
  }

  // Manual mint — either the forwarder wasn't used, or the relayer
  // reported FAILED and we fall through to user-paid finalization.
  if (useForwarder && !forwarderFailed) {
    // Forwarder is still pending past the timeout. Treat as a recoverable
    // failure so the UI can offer a "wait longer / mint manually" choice.
    return fail(
      steps,
      "mint",
      new Error(
        `Forwarder did not finalize within the polling window (state=${
          message.forwardState ?? "unknown"
        }).`,
      ),
      "Forwarder did not finalize in time.",
      snapshot,
      "polling_timeout",
    );
  }

  const destAdapter = input.destinationAdapter ?? input.sourceAdapter;
  let mintCalldata: EvmCall;
  try {
    const mintIntent = buildMintIntent({
      destination: input.destination,
      message: message.message,
      attestation: message.attestation,
    });
    mintCalldata = mintIntent.call;
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to build mint calldata.",
      snapshot,
    );
  }

  try {
    const live = await destAdapter.getChainId();
    if (live !== input.destination.evmChainId) {
      await destAdapter.switchChain(input.destination.evmChainId);
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to switch to destination chain.",
      snapshot,
    );
  }

  let mintHash: `0x${string}`;
  try {
    const { hashes } = await destAdapter.sendCalls([mintCalldata]);
    const last = hashes[hashes.length - 1];
    if (!last) {
      return fail(
        steps,
        "mint",
        new Error("Destination adapter returned no transaction hash."),
        "Destination adapter returned no transaction hash.",
        snapshot,
      );
    }
    mintHash = last;
  } catch (cause) {
    return fail(steps, "mint", cause, "Failed to submit mint.", snapshot);
  }

  steps[3] = {
    name: "mint",
    state: "pending",
    txHash: mintHash,
    forwarded: false,
  };
  listeners?.onStep?.(steps[3]);
  try {
    const receipt = await destAdapter.waitForReceipt(mintHash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "mint",
        new Error(`Mint reverted on-chain (${mintHash}).`),
        "Mint reverted on-chain.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed waiting for mint receipt.",
      snapshot,
    );
  }
  steps[3] = {
    name: "mint",
    state: "success",
    txHash: mintHash,
    forwarded: false,
  };
  listeners?.onStep?.(steps[3]);

  return {
    kind: "success",
    finalTxHash: mintHash,
    steps,
  };
}

function fail(
  steps: Step[],
  stepName: StepName,
  cause: unknown,
  fallbackMessage: string,
  snapshot: BridgeRecoverySnapshot,
  category?: Parameters<typeof toWhiskError>[2],
): SendFailure {
  const error: WhiskError = toWhiskError(cause, fallbackMessage, category);
  const idx = steps.findIndex((s) => s.name === stepName);
  if (idx !== -1) {
    const prev = steps[idx];
    if (prev) {
      const next: Step = {
        ...prev,
        state: "error",
        errorMessage: error.message,
      };
      if (error.category) next.errorCategory = error.category;
      steps[idx] = next;
    }
  }
  return {
    kind: "failure",
    error,
    steps,
    raw: snapshot,
  };
}
