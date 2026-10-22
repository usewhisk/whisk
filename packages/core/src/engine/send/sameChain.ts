import { encodeFunctionData, isAddress as viemIsAddress } from "viem";
import { usdcAbi } from "@usewhisk/cctp";
import type { EvmChain } from "@usewhisk/cctp";
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
  chain: EvmChain;
  recipientAddress: string;
  /** USDC subunits. */
  amount: bigint;
  adapter: EvmAdapter;
  /** Merchant and treasury transfers, sent ahead of the main transfer. */
  customFeeCalls?: EvmCall[];
};

/** Never throws; every failure resolves to a `failure` result. */
export async function executeSameChainSend(
  input: ExecuteSameChainSendInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  const steps: Step[] = [
    { name: "approve", state: "noop" },
    { name: "transfer", state: "pending" },
  ];

  // Checked before the wallet is touched, so nobody is asked to sign a
  // malformed call.
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
    // One hash per call, or one for a whole batch. The main transfer is
    // always last.
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

  // A bundled wallet shares `hash`, so the transfer receipt covers the fee
  // transfers too.
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
