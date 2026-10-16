/**
 * Starknet → Stellar bridge executor.
 *
 * Starknet source: approve + deposit_for_burn_with_hook multicall.
 * `mintRecipient` AND `destinationCaller` = Stellar CctpForwarder felt;
 * hookData carries the recipient strkey.
 *
 * Destination Stellar wallet signs `mint_and_forward(message, attestation)`
 * on the CctpForwarder.
 */
import {
  buildStarknetApproveCall,
  buildStarknetBurnIntent,
  buildStellarForwarderHookData,
  buildStellarMintIntent,
  decodeStrkeyToBytes32,
  pollMessages,
  type BurnFeeTier,
  type CctpNetwork,
  type ForwarderFeeTier,
  type IrisMessage,
  type StarknetCctpChain,
  type StellarCctpChain,
} from "@usewhisk/cctp";
import { ConfigError, toWhiskError, WhiskError } from "../../errors/errors.js";
import type { Step, StepName } from "../../types/step.js";
import type {
  SendFailure,
  SendListeners,
  SendResult,
  StarknetAdapter,
  StellarAdapter,
} from "../types.js";
import type { BridgeRecoverySnapshot } from "./execute.js";

export type ExecuteStarknetToStellarInput = {
  network: CctpNetwork;
  source: StarknetCctpChain;
  destination: StellarCctpChain;
  recipientAddress: string;
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  sourceAdapter: StarknetAdapter;
  destinationAdapter: StellarAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeStarknetToStellar(
  input: ExecuteStarknetToStellarInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  if (
    !input.destinationAdapter ||
    input.destinationAdapter.kind !== "stellar"
  ) {
    throw new ConfigError(
      "executeStarknetToStellar: destinationAdapter must be a StellarAdapter.",
    );
  }

  const steps: Step[] = ALL_STEPS.map((name) => ({ name, state: "pending" }));
  steps[0] = { name: "approve", state: "noop" };
  listeners?.onStep?.(steps[0]);

  const snapshot: BridgeRecoverySnapshot = {
    kind: "bridge",
    network: input.network,
    sourceDomain: input.source.cctpDomain,
    destinationDomain: input.destination.cctpDomain,
    burnAmount: input.burnAmount.toString(),
    maxFee: input.maxFee.toString(),
    recipientAddress: input.recipientAddress,
  };

  // mintRecipient = Stellar Forwarder strkey decoded to 32 bytes,
  // packed as u256. destinationCaller = same.
  const forwarderBytes = decodeStrkeyToBytes32(input.destination.cctpForwarder);
  const forwarderU256 = BigInt(
    "0x" +
      Array.from(forwarderBytes, (b) => b.toString(16).padStart(2, "0")).join(
        "",
      ),
  );

  const hookDataHex = buildStellarForwarderHookData(input.recipientAddress);
  const hookData = hexToBytes(hookDataHex);

  let approveCall, burnIntent;
  try {
    approveCall = buildStarknetApproveCall({
      source: input.source,
      spender: input.source.tokenMessengerMinter,
      amount: input.burnAmount,
    });
    burnIntent = buildStarknetBurnIntent({
      source: input.source,
      destinationDomain: input.destination.cctpDomain,
      amount: input.burnAmount,
      maxFee: input.maxFee,
      mintRecipient: forwarderU256,
      destinationCaller: forwarderU256,
      hookData,
    });
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to build Starknet burn calls.",
      snapshot,
    );
  }

  try {
    const liveChainId = await input.sourceAdapter.getChainId();
    if (liveChainId !== input.source.chainId) {
      return fail(
        steps,
        "burn",
        new Error(`wallet on ${liveChainId}`),
        "Wrong Starknet chainId on source wallet.",
        snapshot,
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to read Starknet chainId.",
      snapshot,
    );
  }

  let burnHash: string;
  try {
    const { hashes } = await input.sourceAdapter.submitCalls([
      approveCall,
      burnIntent.call,
    ]);
    const last = hashes[hashes.length - 1];
    if (!last) {
      return fail(
        steps,
        "burn",
        new Error("no hash"),
        "Starknet adapter returned no tx hash.",
        snapshot,
      );
    }
    burnHash = last;
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to submit Starknet approve+burn.",
      snapshot,
    );
  }
  snapshot.burnTxHash = burnHash as `0x${string}`;
  steps[1] = { name: "burn", state: "pending", txHash: burnHash };
  listeners?.onStep?.(steps[1]);

  try {
    const receipt = await input.sourceAdapter.confirmTransaction(burnHash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "burn",
        new Error(`reverted: ${burnHash}`),
        "Starknet burn reverted.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed waiting for Starknet burn confirmation.",
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
      { sourceDomain: input.source.cctpDomain, transactionHash: burnHash },
      {
        network: input.network,
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
      new Error("timeout"),
      "Timed out waiting for the attestation.",
      snapshot,
      "polling_timeout",
    );
  }
  if (message.status === "failed") {
    return fail(
      steps,
      "fetchAttestation",
      new Error(`Iris failed: ${message.delayReason ?? "no reason"}`),
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
      new Error(`incomplete: ${message.status}`),
      "Attestation did not finalize in time.",
      snapshot,
      "polling_timeout",
    );
  }
  snapshot.message = message.message;
  snapshot.attestation = message.attestation;
  steps[2] = { name: "fetchAttestation", state: "success" };
  listeners?.onStep?.(steps[2]);

  // Stellar mint_and_forward.
  let mintIntent;
  try {
    mintIntent = buildStellarMintIntent({
      destination: input.destination,
      message: hexToBytes(message.message),
      attestation: hexToBytes(message.attestation),
    });
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to build Stellar mint_and_forward.",
      snapshot,
    );
  }

  try {
    const network = await input.destinationAdapter.getNetwork();
    if (network !== input.destination.stellarNetwork) {
      return fail(
        steps,
        "mint",
        new Error(`wallet on ${network}`),
        "Wrong Stellar network on destination wallet.",
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
        new Error("no hash"),
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
        new Error(`reverted: ${mintHash}`),
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

  return { kind: "success", finalTxHash: mintHash, steps };
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
  return { kind: "failure", error, steps, raw: snapshot };
}
