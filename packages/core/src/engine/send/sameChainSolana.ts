import { Buffer } from "node:buffer";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { SolanaChain, SolanaInstruction } from "@usewhisk/cctp";
import {
  InvalidAddressError,
  toWhiskError,
  WhiskError,
} from "../../errors/errors.js";
import type { Step } from "../../types/step.js";
import type { SendListeners, SendResult, SolanaAdapter } from "../types.js";

export type ExecuteSameChainSolanaSendInput = {
  chain: SolanaChain;
  /** Base58 wallet pubkey; the USDC account is derived. */
  recipientAddress: string;
  /** USDC subunits. */
  amount: bigint;
  adapter: SolanaAdapter;
};

/** `transferChecked` checks the mint's decimals. */
const USDC_DECIMALS = 6;

/** Never throws; every failure resolves to a `failure` result. */
export async function executeSameChainSolanaSend(
  input: ExecuteSameChainSolanaSendInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  const steps: Step[] = [
    { name: "approve", state: "noop" },
    { name: "transfer", state: "pending" },
  ];

  let recipient: PublicKey;
  try {
    recipient = new PublicKey(input.recipientAddress);
  } catch {
    const err = new InvalidAddressError(input.recipientAddress);
    return failure(steps, err, "transfer", err.message);
  }

  let sender: PublicKey;
  try {
    sender = new PublicKey(input.adapter.address);
  } catch {
    const err = new InvalidAddressError(input.adapter.address);
    return failure(steps, err, "transfer", err.message);
  }

  const mint = new PublicKey(input.chain.usdc);
  const senderAta = getAssociatedTokenAddressSync(mint, sender);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipient);

  const instructions: TransactionInstruction[] = [
    // Creates the recipient's USDC account if it doesn't exist yet, and
    // does nothing if it does.
    createAssociatedTokenAccountIdempotentInstruction(
      sender,
      recipientAta,
      recipient,
      mint,
    ),
    createTransferCheckedInstruction(
      senderAta,
      mint,
      recipientAta,
      sender,
      input.amount,
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID,
    ),
  ];

  const solanaInstructions: SolanaInstruction[] = instructions.map((ix) => ({
    programId: ix.programId,
    keys: ix.keys,
    data: Buffer.from(ix.data),
    ecosystem: "solana",
  }));

  try {
    const cluster = await input.adapter.getCluster();
    if (cluster !== input.chain.cluster) {
      const err = toWhiskError(
        new Error(`Wallet is on ${cluster}; expected ${input.chain.cluster}.`),
        "Wrong Solana cluster.",
      );
      return failure(steps, err, "transfer", err.message);
    }
  } catch (cause) {
    const err = toWhiskError(cause, "Failed to read wallet cluster.");
    return failure(steps, err, "transfer", err.message);
  }

  let signature: string;
  try {
    const result = await input.adapter.sendTransaction(solanaInstructions);
    signature = result.signature;
  } catch (cause) {
    const err = toWhiskError(cause, "Failed to submit transfer.");
    return failure(steps, err, "transfer", err.message);
  }

  steps[1] = { name: "transfer", state: "pending", txHash: signature };
  listeners?.onStep?.(steps[1]);

  try {
    const receipt = await input.adapter.confirmTransaction(signature);
    if (receipt.status === "reverted") {
      const err = toWhiskError(
        new Error(`Transfer reverted on Solana (${signature}).`),
        "Transfer reverted on Solana.",
        "reverted_onchain",
      );
      return failure(steps, err, "transfer", err.message, signature);
    }
  } catch (cause) {
    const err = toWhiskError(cause, "Failed waiting for confirmation.");
    return failure(steps, err, "transfer", err.message, signature);
  }

  steps[1] = { name: "transfer", state: "success", txHash: signature };
  listeners?.onStep?.(steps[1]);

  return { kind: "success", finalTxHash: signature, steps };
}

function failure(
  steps: Step[],
  error: WhiskError,
  stepName: "transfer",
  message: string,
  signature?: string,
): SendResult {
  const idx = steps.findIndex((s) => s.name === stepName);
  if (idx !== -1) {
    const prev = steps[idx];
    if (prev) {
      const next: Step = {
        ...prev,
        state: "error",
        errorMessage: message,
      };
      if (error.category) next.errorCategory = error.category;
      if (signature) next.txHash = signature;
      steps[idx] = next;
    }
  }
  return { kind: "failure", error, steps };
}
