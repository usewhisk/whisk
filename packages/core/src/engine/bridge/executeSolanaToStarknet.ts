/**
 * Solana → Starknet bridge executor.
 *
 * Solana source burn (no hookData — no Iris forwarder). Recipient
 * Starknet felt is zero-extended into the 32-byte mintRecipient field.
 * Destination Starknet wallet signs `receive_message`.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  buildSolanaBurnIntent,
  buildStarknetReceiveIntent,
  feltToBytes32Hex,
  pollMessages,
  type BurnFeeTier,
  type CctpNetwork,
  type ForwarderFeeTier,
  type IrisMessage,
  type SolanaCctpChain,
  type StarknetCctpChain,
  type StarknetFelt,
} from "@usewhisk/cctp";
import { ConfigError, toWhiskError, WhiskError } from "../../errors/errors.js";
import type { Step, StepName } from "../../types/step.js";
import type {
  SendFailure,
  SendListeners,
  SendResult,
  SolanaAdapter,
  StarknetAdapter,
} from "../types.js";
import type { BridgeRecoverySnapshot } from "./execute.js";

export type ExecuteSolanaToStarknetInput = {
  network: CctpNetwork;
  source: SolanaCctpChain;
  destination: StarknetCctpChain;
  recipientAddress: string;
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  sourceAdapter: SolanaAdapter;
  destinationAdapter: StarknetAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeSolanaToStarknet(
  input: ExecuteSolanaToStarknetInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  if (
    !input.destinationAdapter ||
    input.destinationAdapter.kind !== "starknet"
  ) {
    throw new ConfigError(
      "executeSolanaToStarknet: destinationAdapter must be a StarknetAdapter.",
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

  // Starknet recipient felt → 32-byte mintRecipient.
  const recipientHex = feltToBytes32Hex(input.recipientAddress as StarknetFelt);
  const mintRecipientBytes32 = hexToBytes(recipientHex);

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
  const ownerUsdcAta = getAssociatedTokenAddressSync(
    new PublicKey(input.source.usdc),
    owner,
  );

  let intent;
  try {
    intent = buildSolanaBurnIntent({
      source: input.source,
      destinationDomain: input.destination.cctpDomain,
      amount: input.burnAmount,
      mintRecipientBytes32,
      maxFee: input.maxFee,
      owner,
      messageSentEventDataKey: messageSentEventData.publicKey,
      ownerUsdcAta,
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
        new Error(`wallet on ${cluster}; expected ${input.source.cluster}`),
        "Wrong Solana cluster on source wallet.",
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
        new Error(`reverted: ${burnSignature}`),
        "Solana burn reverted.",
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

  // Iris.
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

  // Starknet receive.
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
