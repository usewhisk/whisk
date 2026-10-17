/**
 * EVM → Stellar bridge executor.
 *
 * Flow:
 *   1. EVM source burns via `depositForBurnWithHook`. CRITICAL: both
 *      `mintRecipient` AND `destinationCaller` MUST be the Stellar
 *      `CctpForwarder` contract — never the user's wallet, or funds are
 *      permanently lost.
 *   2. Iris attests the burn.
 *   3. The recipient's Stellar wallet signs `mint_and_forward(message,
 *      attestation)` on `CctpForwarder`. The Forwarder atomically:
 *        - validates the message
 *        - reads the recipient strkey from hookData
 *        - calls `receive_message` on MessageTransmitter (mints USDC to
 *          itself)
 *        - transfers minted USDC to the recipient
 *
 * Circle does NOT operate a Stellar relayer, so the destinationAdapter
 * is REQUIRED — there's no "auto-forwarder" fallback.
 */
import {
  buildBurnIntent,
  buildStellarForwarderHookData,
  buildStellarMintIntent,
  contractStrkeyToBytes32Hex,
  decodeStrkeyToBytes32,
  pollMessages,
  type BurnFeeTier,
  type EvmCctpChain,
  type CctpNetwork,
  type ForwarderFeeTier,
  type IrisMessage,
  type StellarCctpChain,
} from "@usewhisk/cctp";
import { ConfigError, toWhiskError, WhiskError } from "../../errors/errors.js";
import type { Step, StepName } from "../../types/step.js";
import type {
  EvmAdapter,
  EvmCall,
  SendFailure,
  SendListeners,
  SendResult,
  StellarAdapter,
} from "../types.js";
import type { BridgeRecoverySnapshot } from "./execute.js";

export type ExecuteEvmToStellarInput = {
  network: CctpNetwork;
  source: EvmCctpChain;
  destination: StellarCctpChain;
  /** Recipient strkey (G…, M…, or C…) — encoded into hookData. */
  recipientAddress: string;
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  customFeeCalls?: EvmCall[];
  sourceAdapter: EvmAdapter;
  /** REQUIRED — signs `mint_and_forward` on Stellar. */
  destinationAdapter: StellarAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeEvmToStellar(
  input: ExecuteEvmToStellarInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  if (!input.destinationAdapter) {
    throw new ConfigError(
      "executeEvmToStellar: destinationAdapter is required (Stellar has no auto-forwarder).",
    );
  }
  if (input.destinationAdapter.kind !== "stellar") {
    throw new ConfigError(
      "executeEvmToStellar: destinationAdapter must be a StellarAdapter.",
    );
  }

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

  // The Stellar Forwarder is both the on-chain mintRecipient AND
  // destinationCaller. Any other value causes permanent loss.
  const forwarderBytes32 = decodeStrkeyToBytes32(
    input.destination.cctpForwarder,
  );
  const forwarderHex = contractStrkeyToBytes32Hex(
    input.destination.cctpForwarder,
  );
  // hookData carries the actual recipient (strkey encoded as UTF-8).
  let hookDataHex: `0x${string}`;
  try {
    hookDataHex = buildStellarForwarderHookData(input.recipientAddress);
  } catch (cause) {
    return fail(
      steps,
      "approve",
      cause,
      "Failed to build Stellar Forwarder hookData.",
      snapshot,
    );
  }

  // Build the EVM burn — uses depositForBurnWithHook so the Forwarder
  // can read the recipient out of hookData.
  let burnCalls: EvmCall[];
  try {
    const intent = buildBurnIntent({
      source: input.source,
      destination: input.destination,
      amount: input.burnAmount,
      mintRecipient: forwarderHex,
      destinationCaller: forwarderHex,
      fee: {
        tier: input.tier,
        ...(input.forwarderLevel !== undefined && {
          forwarderLevel: input.forwarderLevel,
        }),
      },
      // withForwarder=false avoids adding an Iris-side forwarder fee
      // (Stellar isn't on Iris's Forwarding Service). customHookData
      // still routes the call through depositForBurnWithHook so the
      // Stellar CctpForwarder receives the recipient bytes.
      withForwarder: false,
      customHookData: hookDataHex,
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

  const customFeeCalls = input.customFeeCalls ?? [];
  const submittedCalls: EvmCall[] = [...customFeeCalls, ...burnCalls];
  const customFeeOffset = customFeeCalls.length;

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
  if (
    message.status !== "complete" ||
    !message.message ||
    !message.attestation
  ) {
    return fail(
      steps,
      "fetchAttestation",
      new Error(
        `Attestation incomplete after polling window (status=${message.status}).`,
      ),
      "Attestation did not finalize in time.",
      snapshot,
      "polling_timeout",
    );
  }
  snapshot.message = message.message;
  snapshot.attestation = message.attestation;
  steps[2] = { name: "fetchAttestation", state: "success" };
  listeners?.onStep?.(steps[2]);

  // Build the Stellar Forwarder invocation.
  const messageBytes = hexToBytes(message.message);
  const attestationBytes = hexToBytes(message.attestation);

  let mintIntent: ReturnType<typeof buildStellarMintIntent>;
  try {
    mintIntent = buildStellarMintIntent({
      destination: input.destination,
      message: messageBytes,
      attestation: attestationBytes,
    });
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to build mint_and_forward invocation.",
      snapshot,
    );
  }

  try {
    const network = await input.destinationAdapter.getNetwork();
    if (network !== input.destination.stellarNetwork) {
      return fail(
        steps,
        "mint",
        new Error(
          `Destination Stellar wallet is on ${network}; expected ${input.destination.stellarNetwork}.`,
        ),
        "Wrong Stellar network on the destination wallet.",
        snapshot,
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to read Stellar network.",
      snapshot,
    );
  }

  let mintHash: string;
  try {
    const result = await input.destinationAdapter.submitInvocation([
      mintIntent.invocation,
    ]);
    const last = result.hashes[result.hashes.length - 1];
    if (!last) {
      return fail(
        steps,
        "mint",
        new Error("Stellar adapter returned no mint hash."),
        "Stellar adapter returned no mint hash.",
        snapshot,
      );
    }
    mintHash = last;
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to submit Stellar mint_and_forward.",
      snapshot,
    );
  }

  steps[3] = {
    name: "mint",
    state: "pending",
    txHash: mintHash,
    forwarded: false,
  };
  listeners?.onStep?.(steps[3]);

  try {
    const receipt = await input.destinationAdapter.confirmTransaction(mintHash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "mint",
        new Error(`Stellar mint_and_forward reverted (${mintHash}).`),
        "Stellar mint_and_forward reverted.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed waiting for Stellar mint confirmation.",
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

  // Reference forwarderBytes32 to avoid unused-import; the value is
  // intentionally derived even when only the hex form is needed for the
  // burn (useful for adapter implementers and future tests).
  void forwarderBytes32;

  return {
    kind: "success",
    finalTxHash: mintHash,
    steps,
  };
}

function hexToBytes(hex: `0x${string}` | string): Uint8Array {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
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
