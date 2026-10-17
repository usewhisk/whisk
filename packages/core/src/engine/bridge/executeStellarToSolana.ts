/**
 * Stellar → Solana bridge executor.
 *
 * Flow:
 *   1. Stellar source signs `deposit_for_burn` (no hook — Solana
 *      destination doesn't run a forwarder). `mintRecipient` is the
 *      recipient's USDC ATA on Solana, 32 raw bytes.
 *   2. Iris attests.
 *   3. Destination Solana wallet signs `receive_message` (with the
 *      message + attestation bytes from Iris). USDC is minted directly
 *      to the recipient's ATA — same flow as EVM → Solana.
 *
 * The recipient's USDC ATA must exist on Solana before submitting
 * `receive_message`; the executor rejects with a clear error if it
 * doesn't (the user pre-creates via a dust transfer or initial fund).
 */
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  buildSolanaReceiveIntent,
  buildStellarApproveInvocation,
  buildStellarBurnIntent,
  canonicalToStellarSubunits,
  decodeStrkeyToBytes32,
  deriveTokenMessenger,
  parseTokenMessengerFeeRecipient,
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

export type ExecuteStellarToSolanaInput = {
  network: Network;
  source: StellarChain;
  destination: SolanaChain;
  /** Recipient Solana wallet pubkey (base58). ATA is derived. */
  recipientAddress: string;
  /** Burn amount in 6-decimal canonical subunits. */
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  sourceAdapter: StellarAdapter;
  /** REQUIRED — signs receive_message on Solana. */
  destinationAdapter: SolanaAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeStellarToSolana(
  input: ExecuteStellarToSolanaInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  if (!input.destinationAdapter || input.destinationAdapter.kind !== "solana") {
    throw new ConfigError(
      "executeStellarToSolana: destinationAdapter must be a SolanaAdapter.",
    );
  }
  const steps: Step[] = ALL_STEPS.map((name) => ({ name, state: "pending" }));
  steps[0] = { name: "approve", state: "noop" }; // Stellar doesn't need approve
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

  // mintRecipient on the Solana side = recipient's USDC ATA (CCTP V2
  // Solana enforces recipient_token_account.key() == mint_recipient).
  let recipientWallet: PublicKey;
  let recipientUsdcAta: PublicKey;
  try {
    recipientWallet = new PublicKey(input.recipientAddress);
    recipientUsdcAta = getAssociatedTokenAddressSync(
      new PublicKey(input.destination.usdc),
      recipientWallet,
    );
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Invalid Solana recipient pubkey.",
      snapshot,
    );
  }

  // Build the Stellar burn — amounts converted to 7 decimals.
  const stellarAmount = canonicalToStellarSubunits(input.burnAmount);
  const stellarMaxFee = canonicalToStellarSubunits(input.maxFee);
  let intent: ReturnType<typeof buildStellarBurnIntent>;
  try {
    intent = buildStellarBurnIntent({
      source: input.source,
      destinationDomain: input.destination.cctpDomain,
      amount: stellarAmount,
      maxFee: stellarMaxFee,
      mintRecipientBytes32: recipientUsdcAta.toBytes(),
      destinationCallerBytes32: new Uint8Array(32), // any caller
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

  try {
    const network = await input.sourceAdapter.getNetwork();
    if (network !== input.source.stellarNetwork) {
      return fail(
        steps,
        "burn",
        new Error(
          `Wallet is on ${network}; expected ${input.source.stellarNetwork}.`,
        ),
        "Wrong Stellar network on the source wallet.",
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

  // Prepend approve (TMM pulls via transfer_from). Stellar SAC requires
  // `live_until_ledger >= current ledger`; use current + 720 ledgers.
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
        new Error("Stellar adapter returned no burn hash."),
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
  steps[1] = { name: "burn", state: "pending", txHash: burnHash };
  listeners?.onStep?.(steps[1]);

  try {
    const receipt = await input.sourceAdapter.confirmTransaction(burnHash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "burn",
        new Error(`Stellar burn reverted (${burnHash}).`),
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

  // Iris poll.
  steps[2] = { name: "fetchAttestation", state: "pending" };
  listeners?.onStep?.(steps[2]);
  let message: IrisMessage | null;
  try {
    message = await pollMessages(
      { sourceDomain: input.source.cctpDomain, transactionHash: burnHash },
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
      new Error(`Attestation incomplete (status=${message.status}).`),
      "Attestation did not finalize in time.",
      snapshot,
      "polling_timeout",
    );
  }
  snapshot.message = message.message;
  snapshot.attestation = message.attestation;
  steps[2] = { name: "fetchAttestation", state: "success" };
  listeners?.onStep?.(steps[2]);

  // Solana destination — same flow as EVM → Solana.
  const destAdapter = input.destinationAdapter;
  try {
    const cluster = await destAdapter.getCluster();
    if (cluster !== input.destination.cluster) {
      return fail(
        steps,
        "mint",
        new Error(
          `Destination wallet on ${cluster}; expected ${input.destination.cluster}.`,
        ),
        "Wrong Solana cluster on destination wallet.",
        snapshot,
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to read Solana cluster.",
      snapshot,
    );
  }

  // Verify the recipient ATA exists (receive_message tx is at the 1232B
  // legacy cap; no headroom to prepend ATA-create).
  try {
    const ataInfo = await destAdapter.getAccountInfo(
      recipientUsdcAta.toBase58(),
    );
    if (!ataInfo) {
      return fail(
        steps,
        "mint",
        new Error(
          `Recipient USDC ATA ${recipientUsdcAta.toBase58()} does not exist. Pre-create it before bridging.`,
        ),
        "Recipient USDC ATA missing on destination.",
        snapshot,
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to verify recipient ATA exists.",
      snapshot,
    );
  }

  // Read TokenMessenger fee_recipient.
  const tmmProgram = new PublicKey(input.destination.tokenMessengerMinter);
  const tokenMessengerPda = deriveTokenMessenger(tmmProgram);
  let feeRecipient: PublicKey;
  try {
    const info = await destAdapter.getAccountInfo(tokenMessengerPda.toBase58());
    if (!info) {
      return fail(
        steps,
        "mint",
        new Error(`TokenMessenger PDA missing on cluster.`),
        "Solana TokenMessenger state missing.",
        snapshot,
      );
    }
    feeRecipient = parseTokenMessengerFeeRecipient(info.data);
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to read TokenMessenger state.",
      snapshot,
    );
  }
  const feeRecipientUsdcAta = getAssociatedTokenAddressSync(
    new PublicKey(input.destination.usdc),
    feeRecipient,
  );

  // Source-token bytes32: Stellar USDC SAC strkey decoded to 32 bytes.
  const sourceTokenBytes32 = decodeStrkeyToBytes32(input.source.usdc);

  let receiveInstruction;
  try {
    const ri = buildSolanaReceiveIntent({
      destination: input.destination,
      message: hexToBytes(message.message),
      attestation: hexToBytes(message.attestation),
      sourceDomain: input.source.cctpDomain,
      sourceTokenBytes32,
      feeRecipientUsdcAta,
      recipientUsdcAta,
      payer: new PublicKey(destAdapter.address),
    });
    receiveInstruction = ri.instruction;
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to build Solana receive instruction.",
      snapshot,
    );
  }

  let mintSignature: string;
  try {
    const result = await destAdapter.sendTransaction([receiveInstruction]);
    mintSignature = result.signature;
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to submit Solana receive_message.",
      snapshot,
    );
  }
  steps[3] = {
    name: "mint",
    state: "pending",
    txHash: mintSignature,
    forwarded: false,
  };
  listeners?.onStep?.(steps[3]);

  try {
    const receipt = await destAdapter.confirmTransaction(mintSignature);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "mint",
        new Error(`Solana receive_message reverted (${mintSignature}).`),
        "Solana mint reverted.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed waiting for Solana mint confirmation.",
      snapshot,
    );
  }
  steps[3] = {
    name: "mint",
    state: "success",
    txHash: mintSignature,
    forwarded: false,
  };
  listeners?.onStep?.(steps[3]);

  return { kind: "success", finalTxHash: mintSignature, steps };
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
