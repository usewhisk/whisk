/**
 * Stellar to Starknet bridge. Circle does not forward to Starknet, so the
 * burn carries no hook and the Starknet wallet signs `receive_message`.
 */
import { attestationPolling } from "./polling.js";
import {
  buildStarknetReceiveIntent,
  buildStellarApproveInvocation,
  buildStellarBurnIntent,
  canonicalToStellarSubunits,
  feltToBytes32Hex,
  pollMessages,
  type BurnFeeTier,
  type Network,
  type ForwarderFeeTier,
  type IrisMessage,
  type StarknetChain,
  type StarknetFelt,
  type StellarChain,
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
import { starknetRecipientProblem } from "./starknetRecipient.js";

export type ExecuteStellarToStarknetInput = {
  network: Network;
  source: StellarChain;
  destination: StarknetChain;
  recipientAddress: string;
  /** 6-decimal subunits. */
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  sourceAdapter: StellarAdapter;
  destinationAdapter: StarknetAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeStellarToStarknet(
  input: ExecuteStellarToStarknetInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  if (
    !input.destinationAdapter ||
    input.destinationAdapter.kind !== "starknet"
  ) {
    throw new ConfigError(
      "executeStellarToStarknet: destinationAdapter must be a StarknetAdapter.",
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

  const mintRecipientBytes32 = hexToBytes(
    feltToBytes32Hex(input.recipientAddress as StarknetFelt),
  );

  const stellarAmount = canonicalToStellarSubunits(input.burnAmount);
  const stellarMaxFee = canonicalToStellarSubunits(input.maxFee);

  let intent;
  try {
    intent = buildStellarBurnIntent({
      minFinalityThreshold: input.tier.finalityThreshold,
      source: input.source,
      destinationDomain: input.destination.cctpDomain,
      amount: stellarAmount,
      maxFee: stellarMaxFee,
      mintRecipientBytes32,
      destinationCallerBytes32: new Uint8Array(32),
      caller: input.sourceAdapter.address,
    });
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to build Stellar burn intent.",
      snapshot,
    );
  }

  // The SAC requires `live_until_ledger >= current ledger`, so a static 0
  // fails.
  let approveExpirationLedger: number;
  try {
    const latest = await input.sourceAdapter.getLatestLedger();
    approveExpirationLedger = latest + 720;
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to read Stellar latest ledger.",
      snapshot,
    );
  }
  const approveInvocation = buildStellarApproveInvocation({
    source: input.source,
    owner: input.sourceAdapter.address,
    spender: input.source.tokenMessengerMinter,
    amount: stellarAmount,
    expirationLedger: approveExpirationLedger,
  });

  try {
    const network = await input.sourceAdapter.getNetwork();
    if (network !== input.source.stellarNetwork) {
      return fail(
        steps,
        "burn",
        new Error(`wallet on ${network}`),
        "Wrong Stellar network.",
        snapshot,
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to read Stellar network.",
      snapshot,
    );
  }

  const destinationProblem = await starknetRecipientProblem(
    input.destination,
    input.destinationAdapter,
  );
  if (destinationProblem) {
    return fail(
      steps,
      "burn",
      destinationProblem,
      destinationProblem.message,
      snapshot,
    );
  }

  let burnHash: string;
  try {
    const result = await input.sourceAdapter.submitInvocation([
      approveInvocation,
      intent.invocation,
    ]);
    const last = result.hashes[result.hashes.length - 1];
    if (!last) {
      return fail(
        steps,
        "burn",
        new Error("no hash"),
        "Stellar adapter returned no burn hash.",
        snapshot,
      );
    }
    burnHash = last;
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to submit Stellar burn.",
      snapshot,
    );
  }
  snapshot.burnTxHash = burnHash as `0x${string}`;
  listeners?.onBurnSubmitted?.(burnHash);
  steps[1] = { name: "burn", state: "pending", txHash: burnHash };
  listeners?.onStep?.(steps[1]);

  try {
    const receipt = await input.sourceAdapter.confirmTransaction(burnHash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "burn",
        new Error(`reverted: ${burnHash}`),
        "Stellar burn reverted.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed waiting for Stellar burn confirmation.",
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
      new Error("timeout"),
      "Timed out waiting for the attestation.",
      snapshot,
      "polling_timeout",
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

  let receiveIntent;
  try {
    receiveIntent = buildStarknetReceiveIntent({
      destination: input.destination,
      message: message.message,
      attestation: message.attestation,
    });
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to build Starknet receive call.",
      snapshot,
    );
  }

  try {
    const liveChainId = await input.destinationAdapter.getChainId();
    if (liveChainId !== input.destination.chainId) {
      return fail(
        steps,
        "mint",
        new Error(`wallet on ${liveChainId}`),
        "Wrong Starknet chainId on destination wallet.",
        snapshot,
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to read Starknet chainId.",
      snapshot,
    );
  }

  let mintHash: string;
  try {
    const { hashes } = await input.destinationAdapter.submitCalls([
      receiveIntent.call,
    ]);
    const last = hashes[hashes.length - 1];
    if (!last) {
      return fail(
        steps,
        "mint",
        new Error("no hash"),
        "Starknet adapter returned no tx hash.",
        snapshot,
      );
    }
    mintHash = last;
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to submit Starknet receive_message.",
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
        "Starknet receive_message reverted.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed waiting for Starknet mint confirmation.",
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
