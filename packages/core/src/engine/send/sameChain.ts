/**
 * Same-chain USDC transfer.
 *
 * The recipient and sender are on the same chain — no bridging needed.
 * The engine encodes one ERC-20 `transfer(to, amount)` call and hands
 * it to the adapter. There's no approve step because direct transfers
 * do not require an allowance.
 */
import { encodeFunctionData, isAddress as viemIsAddress } from "viem";
import { usdcAbi } from "@usewhisk/cctp";
import type { EvmCctpChain } from "@usewhisk/cctp";
import {
  InvalidAddressError,
  toWhiskError,
  WhiskError,
} from "../../errors/errors.js";
import type { Step } from "../../types/step.js";
import type {
  EvmAdapter,
  EvmCall,
  SendListeners,
  SendResult,
} from "../types.js";

export type ExecuteSameChainSendInput = {
  /** Chain definition from `@usewhisk/cctp` — gives us USDC address + EVM chain ID. */
  chain: EvmCctpChain;
  recipientAddress: string;
  /** Amount in USDC subunits (6 decimals). */
  amount: bigint;
  adapter: EvmAdapter;
  /**
   * Optional integrator-fee transfer calls — prepended to the main
   * transfer (merchant share first, treasury share second). Bundled
   * via EIP-5792 when the wallet supports it; signed sequentially
   * otherwise.
   */
  customFeeCalls?: EvmCall[];
};

/**
 * Execute a same-chain USDC transfer. Returns a {@link SendResult} —
 * either a `success` with the transfer txHash or a `failure` with the
 * typed error and the snapshot of steps so the caller can render
 * progress. The function never throws.
 */
export async function executeSameChainSend(
  input: ExecuteSameChainSendInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  const steps: Step[] = [
    { name: "approve", state: "noop" },
    { name: "transfer", state: "pending" },
  ];

  // Address validation happens BEFORE any wallet interaction so the
  // user isn't asked to sign a malformed call.
  if (!viemIsAddress(input.recipientAddress)) {
    const err = new InvalidAddressError(input.recipientAddress);
    return failure(steps, err, "transfer", err.message);
  }

  const transferCall: EvmCall = {
    to: input.chain.usdc,
    data: encodeFunctionData({
      abi: usdcAbi,
      functionName: "transfer",
      args: [input.recipientAddress, input.amount],
    }),
    value: 0n,
  };
  const customFeeCalls = input.customFeeCalls ?? [];
  const submittedCalls: EvmCall[] = [...customFeeCalls, transferCall];

  // Make sure the wallet is on the right chain. The adapter resolves
  // the prompt itself; we only surface the failure.
  try {
    const live = await input.adapter.getChainId();
    if (live !== input.chain.evmChainId) {
      await input.adapter.switchChain(input.chain.evmChainId);
    }
  } catch (cause) {
    const err = toWhiskError(cause, "Failed to switch chain.");
    return failure(steps, err, "transfer", err.message);
  }

  let hash: `0x${string}`;
  const customFeeHashes: `0x${string}`[] = [];
  try {
    const { hashes } = await input.adapter.sendCalls(submittedCalls);
    if (hashes.length === 0) {
      const err = toWhiskError(
        new Error("Adapter returned no transaction hash for the transfer."),
        "Adapter returned no transaction hash.",
      );
      return failure(steps, err, "transfer", err.message);
    }
    // sendCalls returns one hash per call (or a single bundle hash).
    // Last entry is always the main transfer; earlier entries (if
    // present and distinct) are the merchant-fee transfers.
    hash = hashes[hashes.length - 1] as `0x${string}`;
    if (customFeeCalls.length > 0 && hashes.length > 1) {
      for (let i = 0; i < customFeeCalls.length; i++) {
        customFeeHashes.push(hashes[i] as `0x${string}`);
      }
    }
  } catch (cause) {
    const err = toWhiskError(cause, "Failed to submit transfer.");
    return failure(steps, err, "transfer", err.message);
  }

  // Sequential wallets: wait for each customFee receipt before the
  // main transfer is treated as confirmed. Bundled wallets share
  // `hash`, so the transfer-receipt wait below covers every call.
  for (const customFeeHash of customFeeHashes) {
    if (customFeeHash === hash) continue;
    try {
      const receipt = await input.adapter.waitForReceipt(customFeeHash);
      if (receipt.status === "reverted") {
        const err = toWhiskError(
          new Error(
            `Merchant fee transfer reverted on-chain (${customFeeHash}).`,
          ),
          "Merchant fee transfer reverted on-chain.",
          "reverted_onchain",
        );
        return failure(steps, err, "transfer", err.message, hash);
      }
    } catch (cause) {
      const err = toWhiskError(
        cause,
        "Failed waiting for merchant fee receipt.",
      );
      return failure(steps, err, "transfer", err.message, hash);
    }
  }

  steps[1] = { name: "transfer", state: "pending", txHash: hash };
  listeners?.onStep?.(steps[1]);

  try {
    const receipt = await input.adapter.waitForReceipt(hash);
    if (receipt.status === "reverted") {
      const err = toWhiskError(
        new Error(`Transfer reverted on-chain (tx ${hash}).`),
        "Transfer reverted on-chain.",
        "reverted_onchain",
      );
      return failure(steps, err, "transfer", err.message, hash);
    }
  } catch (cause) {
    const err = toWhiskError(cause, "Failed waiting for transfer receipt.");
    return failure(steps, err, "transfer", err.message, hash);
  }

  steps[1] = { name: "transfer", state: "success", txHash: hash };
  listeners?.onStep?.(steps[1]);

  return { kind: "success", finalTxHash: hash, steps };
}

function failure(
  steps: Step[],
  error: WhiskError,
  stepName: "transfer",
  message: string,
  txHash?: `0x${string}`,
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
      if (txHash) next.txHash = txHash;
      steps[idx] = next;
    }
  }
  return { kind: "failure", error, steps };
}
