/**
 * Solana → EVM bridge executor.
 *
 * Flow:
 *   1. Generate ephemeral keypair for `message_sent_event_data`.
 *   2. Build a Solana `deposit_for_burn_with_hook` instruction with
 *      the canonical `cctp-forward` hookData and the EVM destination
 *      address encoded as bytes32 (left-padded).
 *   3. Submit via the `SolanaAdapter`, partial-signed by the ephemeral
 *      keypair and signed by the connected wallet.
 *   4. Poll Iris for the attestation + forwarder state.
 *   5. Forwarder relays the EVM-side mint — no destination adapter
 *      needed. Return success with the forwarder tx hash.
 *
 * If the forwarder reports `FAILED`, the flow returns a typed failure
 * with the recovery snapshot. Cross-ecosystem manual mint via Whisk
 * isn't supported in v1 — the snapshot lets the merchant resume out of
 * band.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  buildSolanaBurnIntent,
  CCTP_FORWARD_HOOK_DATA,
  pollMessages,
  type BurnFeeTier,
  type EvmCctpChain,
  type ForwarderFeeTier,
  type IrisMessage,
  type SolanaCctpChain,
} from "@usewhisk/cctp";
import { toWhiskError, WhiskError } from "../../errors/errors.js";
import type { Step, StepName } from "../../types/step.js";
import type {
  SendFailure,
  SendListeners,
  SendResult,
  SolanaAdapter,
} from "../types.js";
import type { BridgeRecoverySnapshot } from "./execute.js";

export type ExecuteSolanaToEvmInput = {
  network: "mainnet" | "testnet";
  source: SolanaCctpChain;
  destination: EvmCctpChain;
  /** Recipient EVM 0x-address on the destination chain. */
  recipientAddress: `0x${string}`;
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  useForwarder?: boolean;
  sourceAdapter: SolanaAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeSolanaToEvm(
  input: ExecuteSolanaToEvmInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  const useForwarder = input.useForwarder ?? true;
  const steps: Step[] = ALL_STEPS.map((name) => ({ name, state: "pending" }));
  // Solana doesn't have a separate approve step; the user signs the
  // burn directly. Mark it noop right away.
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

  // ---- build burn intent --------------------------------------------------
  const messageSentEventData = Keypair.generate();
  let owner: PublicKey;
  try {
    owner = new PublicKey(input.sourceAdapter.address);
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Source adapter has an invalid Solana pubkey.",
      snapshot,
    );
  }
  const usdcMint = new PublicKey(input.source.usdc);
  const ownerUsdcAta = getAssociatedTokenAddressSync(usdcMint, owner);

  // Encode EVM recipient as bytes32 — 20-byte address left-padded with
  // 12 zero bytes. CCTP V2 messages always use 32-byte mintRecipient.
  const mintRecipientBytes32 = new Uint8Array(32);
  const evmAddrHex = input.recipientAddress.slice(2);
  for (let i = 0; i < 20; i++) {
    mintRecipientBytes32[12 + i] = parseInt(
      evmAddrHex.slice(i * 2, i * 2 + 2),
      16,
    );
  }

  let intent: ReturnType<typeof buildSolanaBurnIntent>;
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
      ...(useForwarder && {
        hookData: hexToBytes(CCTP_FORWARD_HOOK_DATA),
      }),
    });
  } catch (cause) {
    return fail(steps, "burn", cause, "Failed to build burn intent.", snapshot);
  }

  // ---- check cluster ------------------------------------------------------
  try {
    const cluster = await input.sourceAdapter.getCluster();
    if (cluster !== input.source.cluster) {
      const err = toWhiskError(
        new Error(`Wallet is on ${cluster}; expected ${input.source.cluster}.`),
        "Wrong Solana cluster.",
      );
      return fail(steps, "burn", err, err.message, snapshot);
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

  // ---- submit burn -------------------------------------------------------
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
      "Failed waiting for burn confirmation.",
      snapshot,
    );
  }
  steps[1] = { name: "burn", state: "success", txHash: burnSignature };
  listeners?.onStep?.(steps[1]);

  // ---- attestation -------------------------------------------------------
  steps[2] = { name: "fetchAttestation", state: "pending" };
  listeners?.onStep?.(steps[2]);

  let message: IrisMessage | null;
  try {
    message = await pollMessages(
      {
        sourceDomain: input.source.cctpDomain,
        transactionHash: burnSignature,
      },
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

  // ---- forwarder mint on EVM destination ---------------------------------
  if (!useForwarder) {
    return fail(
      steps,
      "mint",
      new Error(
        "Manual mint on EVM destination from a Solana source is not implemented in this build.",
      ),
      "Cross-ecosystem manual mint not implemented.",
      snapshot,
    );
  }

  const forwardComplete =
    message.forwardState === "COMPLETE" && message.forwardTxHash;
  const forwardFailed = message.forwardState === "FAILED";

  if (forwardComplete) {
    snapshot.forwardTxHash = message.forwardTxHash ?? undefined;
    steps[3] = {
      name: "mint",
      state: "success",
      forwarded: true,
      ...(message.forwardTxHash ? { txHash: message.forwardTxHash } : {}),
    };
    listeners?.onStep?.(steps[3]);
    return {
      kind: "success",
      ...(message.forwardTxHash && { finalTxHash: message.forwardTxHash }),
      steps,
    };
  }

  if (forwardFailed) {
    return fail(
      steps,
      "mint",
      new Error("Forwarder reported FAILED on the EVM mint."),
      "Forwarder reported FAILED. Use the snapshot to recover manually.",
      snapshot,
      "failed_offchain",
    );
  }

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

function hexToBytes(hex: `0x${string}`): Uint8Array {
  const stripped = hex.slice(2);
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
