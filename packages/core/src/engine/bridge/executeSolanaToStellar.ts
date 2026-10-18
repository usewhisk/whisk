/**
 * Solana → Stellar bridge executor.
 *
 * Flow:
 *   1. Solana source burns via `deposit_for_burn_with_hook`. The burn's
 *      `mintRecipient` AND `destinationCaller` MUST both be the Stellar
 *      `CctpForwarder` contract (decoded to 32 bytes). The actual user
 *      recipient strkey goes in hookData.
 *   2. Iris attests.
 *   3. The destination Stellar wallet signs `mint_and_forward` on
 *      `CctpForwarder`. Atomic mint + forward to the user.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  buildSolanaBurnIntent,
  buildStellarForwarderHookData,
  buildStellarMintIntent,
  decodeStrkeyToBytes32,
  pollMessages,
  type BurnFeeTier,
  type Network,
  type ForwarderFeeTier,
  type IrisMessage,
  type SolanaChain,
  type StellarChain,
} from "@usewhisk/cctp";
import { ConfigError, toWhiskError, WhiskError } from "../../errors/errors.js";
import type { Step, StepName } from "../../types/step.js";
import type {
  SendFailure,
  SendListeners,
  SendResult,
  SolanaAdapter,
  StellarAdapter,
} from "../types.js";
import type { BridgeRecoverySnapshot } from "./execute.js";

export type ExecuteSolanaToStellarInput = {
  network: Network;
  source: SolanaChain;
  destination: StellarChain;
  /** Recipient Stellar strkey (G/M/C). Encoded into hookData. */
  recipientAddress: string;
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  sourceAdapter: SolanaAdapter;
  /** REQUIRED — signs mint_and_forward on Stellar. */
  destinationAdapter: StellarAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeSolanaToStellar(
  input: ExecuteSolanaToStellarInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  if (!input.destinationAdapter) {
    throw new ConfigError(
      "executeSolanaToStellar: destinationAdapter required (Stellar has no auto-forwarder).",
    );
  }
  if (input.destinationAdapter.kind !== "stellar") {
    throw new ConfigError(
      "executeSolanaToStellar: destinationAdapter must be a StellarAdapter.",
    );
  }

  const steps: Step[] = ALL_STEPS.map((name) => ({ name, state: "pending" }));
  steps[0] = { name: "approve", state: "noop" }; // Solana doesn't need approve
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

  const forwarderBytes32 = decodeStrkeyToBytes32(
    input.destination.cctpForwarder,
  );
  let hookData: Uint8Array;
  try {
    const hex = buildStellarForwarderHookData(input.recipientAddress);
    hookData = hexToBytes(hex);
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to build Stellar Forwarder hookData.",
      snapshot,
    );
  }

  // Build Solana burn intent. mintRecipient + destinationCaller =
  // Forwarder bytes32.
  const messageSentEventData = Keypair.generate();
  let owner: PublicKey;
  try {
    owner = new PublicKey(input.sourceAdapter.address);
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Source adapter has invalid Solana pubkey.",
      snapshot,
    );
  }
  const usdcMint = new PublicKey(input.source.usdc);
  const ownerUsdcAta = getAssociatedTokenAddressSync(usdcMint, owner);

  let intent: ReturnType<typeof buildSolanaBurnIntent>;
  try {
    intent = buildSolanaBurnIntent({
      minFinalityThreshold: input.tier.finalityThreshold,
      source: input.source,
      destinationDomain: input.destination.cctpDomain,
      amount: input.burnAmount,
      mintRecipientBytes32: forwarderBytes32,
      destinationCallerBytes32: forwarderBytes32,
      maxFee: input.maxFee,
      owner,
      messageSentEventDataKey: messageSentEventData.publicKey,
      ownerUsdcAta,
      hookData,
    });
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to build Solana burn intent.",
      snapshot,
    );
  }

  try {
    const cluster = await input.sourceAdapter.getCluster();
    if (cluster !== input.source.cluster) {
      return fail(
        steps,
        "burn",
        new Error(`Wallet is on ${cluster}; expected ${input.source.cluster}.`),
        "Wrong Solana cluster on the source wallet.",
        snapshot,
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to read Solana cluster.",
      snapshot,
    );
  }

  let burnSignature: string;
  try {
    const result = await input.sourceAdapter.sendTransaction(
      [intent.instruction],
      {
        extraSigners: [
          {
            publicKey: messageSentEventData.publicKey.toBase58(),
            secretKey: messageSentEventData.secretKey,
          },
        ],
      },
    );
    burnSignature = result.signature;
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to submit Solana burn.",
      snapshot,
    );
  }

  snapshot.burnTxHash = burnSignature as `0x${string}`;
  steps[1] = { name: "burn", state: "pending", txHash: burnSignature };
  listeners?.onStep?.(steps[1]);

  try {
    const receipt = await input.sourceAdapter.confirmTransaction(burnSignature);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "burn",
        new Error(`Burn reverted on Solana (${burnSignature}).`),
        "Burn reverted on Solana.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed waiting for Solana burn confirmation.",
      snapshot,
    );
  }
  steps[1] = { name: "burn", state: "success", txHash: burnSignature };
  listeners?.onStep?.(steps[1]);

  steps[2] = { name: "fetchAttestation", state: "pending" };
  listeners?.onStep?.(steps[2]);
  let message: IrisMessage | null;
  try {
    message = await pollMessages(
      { sourceDomain: input.source.cctpDomain, transactionHash: burnSignature },
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

  // Mint on Stellar via Forwarder.
  let mintIntent: ReturnType<typeof buildStellarMintIntent>;
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
