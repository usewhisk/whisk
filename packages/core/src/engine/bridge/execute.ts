/**
 * EVM to EVM bridge: approve and burn on the source, wait for Iris, then
 * let Circle's forwarder mint, or mint with the user's wallet when
 * forwarding is off or the forwarder reported FAILED.
 *
 * Never throws. Every failure resolves to a `failure` result carrying the
 * step timeline and a recovery snapshot.
 */
import { attestationPolling } from "./polling.js";
import { evmBurnCalls, type UpfrontFee } from "./upfront.js";
import {
  buildMintIntent,
  isForwardDone,
  pollMessages,
  type BurnFeeTier,
  type EvmChain,
  type Network,
  type IrisMessage,
} from "@usewhisk/cctp";
import { toWhiskError, WhiskError } from "../../errors/errors.js";
import { settleFee, submitWithFee, type FeeCharge } from "../customFee.js";
import type { Step, StepName } from "../../types/step.js";
import type {
  EvmAdapter,
  EvmCall,
  SendFailure,
  SendListeners,
  SendResult,
} from "../types.js";

export type ExecuteBridgeInput = {
  network: Network;
  source: EvmChain;
  destination: EvmChain;
  recipientAddress: string;
  /** USDC subunits. */
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  /** Default `true`. When `false`, the user mints. */
  useForwarder?: boolean;
  /** The merchant fee, sent with the burn or once it has landed. */
  customFee?: FeeCharge;
  sourceAdapter: EvmAdapter;
  /** Set when the fees are paid upfront from Circle's signed quote. */
  upfront?: UpfrontFee;
  /** Signs a manual mint. Falls back to `sourceAdapter` when absent. */
  destinationAdapter?: EvmAdapter;
  /** Defaults to Circle's published attestation time for the source. */
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

/** Stored on `SendFailure.raw` so a transfer can be resumed. */
export type BridgeRecoverySnapshot = {
  kind: "bridge";
  network: Network;
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

  let burnCalls: EvmCall[];
  try {
    burnCalls = evmBurnCalls(
      {
        source: input.source,
        destination: input.destination,
        amount: input.burnAmount,
        mintRecipient: input.recipientAddress,
        fee: { tier: input.tier, maxFee: input.maxFee },
        withForwarder: useForwarder,
      },
      input.upfront,
      input.sourceAdapter.address,
    );
  } catch (cause) {
    return fail(
      steps,
      "approve",
      cause,
      "Failed to build burn intent.",
      snapshot,
    );
  }

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

  // burnCalls is [approve, burn], or [burn] if the approve was skipped.
  const hasApprove = burnCalls.length === 2;
  let approveHash: `0x${string}` | undefined;
  let burnHash: `0x${string}`;
  try {
    const hashes = await submitWithFee(
      input.sourceAdapter,
      input.source.evmChainId,
      burnCalls,
      input.customFee,
      (hash) => listeners?.onBurnSubmitted?.(hash),
    );
    if (hashes.length === 0) {
      return fail(
        steps,
        hasApprove ? "approve" : "burn",
        new Error("Source adapter returned no transaction hash."),
        "Source adapter returned no transaction hash.",
        snapshot,
      );
    }
    // One hash per call, or one for a whole batch. The burn is last.
    burnHash = hashes[hashes.length - 1] as `0x${string}`;
    if (hasApprove) approveHash = hashes[0] as `0x${string}`;
  } catch (cause) {
    return fail(
      steps,
      hasApprove ? "approve" : "burn",
      cause,
      "Failed to submit burn.",
      snapshot,
    );
  }

  // Saved before any receipt wait, which can outlive the tab.
  listeners?.onBurnSubmitted?.(burnHash);

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
  await settleFee(input.sourceAdapter, input.customFee);

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
        ...attestationPolling(input),
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
  snapshot.message = message.message;
  snapshot.attestation = message.attestation;
  steps[2] = { name: "fetchAttestation", state: "success" };
  listeners?.onStep?.(steps[2]);

  const forwarderHandled = useForwarder && isForwardDone(message);
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

  if (useForwarder && !forwarderFailed) {
    // Still pending past the timeout. Recoverable, so the UI can offer to
    // wait longer or mint manually.
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

  // Forwarding is off, or the forwarder reported FAILED: the user mints.
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
