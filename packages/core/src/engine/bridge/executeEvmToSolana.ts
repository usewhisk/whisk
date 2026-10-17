/**
 * EVM → Solana bridge executor.
 *
 * Flow:
 *   1. Build EVM `depositForBurn` (no Forwarder hook — destination is
 *      Solana, no Forwarder there).
 *   2. Switch sourceAdapter to the source EVM chain.
 *   3. Submit `approve` + `depositForBurn` (with optional customFee
 *      transfers prepended) via EVM sourceAdapter.
 *   4. Wait for receipts.
 *   5. Poll Iris for the attestation (no forwarderState — manual mint).
 *   6. Fetch the on-chain Solana TokenMessenger, parse `fee_recipient`,
 *      derive its USDC ATA.
 *   7. Build the Solana receive instructions:
 *        a. idempotent `create_associated_token_account` for the
 *           recipient's ATA (if not pre-created)
 *        b. `receive_message` with the Iris message + attestation
 *   8. Submit via destinationAdapter (Solana) — single tx.
 *   9. Confirm and return success.
 *
 * Notes
 *   - destinationAdapter is REQUIRED. There's no Solana-side Forwarder,
 *     so the recipient must sign (or someone signing on their behalf).
 *   - The recipient's ATA is created idempotently in the same tx as
 *     receive_message; no separate signature needed.
 */
import {
  buildBurnIntent,
  buildSolanaReceiveIntent,
  parseTokenMessengerFeeRecipient,
  pollMessages,
  deriveTokenMessenger,
  toBytes32,
  type BurnFeeTier,
  type EvmChain,
  type Network,
  type ForwarderFeeTier,
  type IrisMessage,
  type SolanaChain,
  type SolanaInstruction,
} from "@usewhisk/cctp";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ConfigError, toWhiskError, WhiskError } from "../../errors/errors.js";
import type { Step, StepName } from "../../types/step.js";
import type {
  EvmAdapter,
  EvmCall,
  SendFailure,
  SendListeners,
  SendResult,
  SolanaAdapter,
} from "../types.js";
import type { BridgeRecoverySnapshot } from "./execute.js";

export type ExecuteEvmToSolanaInput = {
  network: Network;
  source: EvmChain;
  destination: SolanaChain;
  /** Recipient base58 pubkey on the destination Solana chain. */
  recipientAddress: string;
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  /** Always false in this direction — no Solana-side Forwarder. */
  useForwarder?: false;
  customFeeCalls?: EvmCall[];
  sourceAdapter: EvmAdapter;
  /** REQUIRED — signs the Solana `receive_message`. */
  destinationAdapter: SolanaAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeEvmToSolana(
  input: ExecuteEvmToSolanaInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  if (!input.destinationAdapter) {
    throw new ConfigError(
      "executeEvmToSolana: destinationAdapter is required for EVM → Solana bridges.",
    );
  }
  if (input.destinationAdapter.kind !== "solana") {
    throw new ConfigError(
      "executeEvmToSolana: destinationAdapter must be a SolanaAdapter.",
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

  // ---- derive recipient ATA ----------------------------------------------
  // CCTP V2's Solana receive_message enforces that the mintRecipient
  // encoded in the burn message matches the destination's USDC ATA —
  // NOT the wallet pubkey (`InvalidMintRecipient`, Anchor 6009). On EVM
  // the recipient IS the wallet address; on Solana it's the ATA, since
  // SPL balances live on token accounts. The user-facing Whisk API
  // accepts the wallet, and we derive the ATA here.
  const destUsdcMint = new PublicKey(input.destination.usdc);
  let recipientWallet: PublicKey;
  try {
    recipientWallet = new PublicKey(input.recipientAddress);
  } catch (cause) {
    return fail(
      steps,
      "approve",
      cause,
      "Invalid Solana recipient pubkey.",
      snapshot,
    );
  }
  const recipientUsdcAta = getAssociatedTokenAddressSync(
    destUsdcMint,
    recipientWallet,
  );

  // ---- build burn intent (no hook, no Forwarder) --------------------------
  // mintRecipient = recipient's USDC ATA on Solana (32-byte pubkey).
  let burnCalls: EvmCall[];
  try {
    const intent = buildBurnIntent({
      source: input.source,
      destination: input.destination,
      amount: input.burnAmount,
      mintRecipient: recipientUsdcAta.toBase58(),
      fee: {
        tier: input.tier,
        ...(input.forwarderLevel !== undefined && {
          forwarderLevel: input.forwarderLevel,
        }),
      },
      // Hard-disable Forwarder — Solana has no Forwarder contract.
      withForwarder: false,
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

  // ---- mint on Solana ----------------------------------------------------
  const destAdapter = input.destinationAdapter;

  try {
    const cluster = await destAdapter.getCluster();
    if (cluster !== input.destination.cluster) {
      return fail(
        steps,
        "mint",
        new Error(
          `Destination wallet is on ${cluster}; expected ${input.destination.cluster}.`,
        ),
        "Wrong Solana cluster on the destination wallet.",
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

  // Read TokenMessenger state to discover the fee_recipient pubkey.
  // Required as a remaining account on `receive_message`.
  const tmmProgram = new PublicKey(input.destination.tokenMessengerMinter);
  const tokenMessengerPda = deriveTokenMessenger(tmmProgram);
  let feeRecipient: PublicKey;
  try {
    const info = await destAdapter.getAccountInfo(tokenMessengerPda.toBase58());
    if (!info) {
      return fail(
        steps,
        "mint",
        new Error(
          `TokenMessenger PDA not found on cluster (${tokenMessengerPda.toBase58()}).`,
        ),
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

  // recipientUsdcAta + recipientWallet were already derived above for the
  // burn-side mintRecipient encoding. Reuse them here.
  const feeRecipientUsdcAta = getAssociatedTokenAddressSync(
    destUsdcMint,
    feeRecipient,
  );

  // The receive_message instruction is already at the 1232-byte legacy
  // transaction-size cap with no headroom for a prepended ATA-create.
  // Make sure the recipient ATA already exists; if not, the caller must
  // pre-create it (e.g. by sending the recipient a dust SPL transfer
  // first, or by funding the wallet directly).
  try {
    const ataInfo = await destAdapter.getAccountInfo(
      recipientUsdcAta.toBase58(),
    );
    if (!ataInfo) {
      return fail(
        steps,
        "mint",
        new Error(
          `Recipient USDC ATA ${recipientUsdcAta.toBase58()} does not exist. Pre-create it before bridging from EVM.`,
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

  // Source-token bytes32 = EVM USDC address left-padded.
  let sourceTokenBytes32: Uint8Array;
  try {
    const hex = toBytes32(input.source.usdc).slice(2);
    sourceTokenBytes32 = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      sourceTokenBytes32[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to encode source token as bytes32.",
      snapshot,
    );
  }

  const messageBytes = hexToBytes(message.message);
  const attestationBytes = hexToBytes(message.attestation);

  const payer = new PublicKey(destAdapter.address);

  let receiveInstruction: SolanaInstruction;
  try {
    const intent = buildSolanaReceiveIntent({
      destination: input.destination,
      message: messageBytes,
      attestation: attestationBytes,
      sourceDomain: input.source.cctpDomain,
      sourceTokenBytes32,
      feeRecipientUsdcAta,
      recipientUsdcAta,
      payer,
    });
    receiveInstruction = intent.instruction;
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to build receive instruction.",
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
      "Failed to submit Solana mint.",
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
        new Error(`Mint reverted on Solana (${mintSignature}).`),
        "Mint reverted on Solana.",
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

  return {
    kind: "success",
    finalTxHash: mintSignature,
    steps,
  };
}

// --- helpers ---------------------------------------------------------------

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
