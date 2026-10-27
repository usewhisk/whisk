"use client";

import { useMemo } from "react";
import { useAccount, useConfig as useWagmiConfig } from "wagmi";
import {
  getCapabilities,
  getChainId,
  sendCalls as sendCallsAction,
  sendTransaction,
  type Config,
  switchChain as switchChainAction,
  waitForCallsStatus,
  waitForTransactionReceipt,
} from "@wagmi/core";
import { BaseError } from "viem";
import {
  toWhiskError,
  WalletCapabilityError,
  type EvmAdapter,
  type EvmCall,
  type SendCallsOptions,
  type SendCallsResult,
} from "@usewhisk/core";

/**
 * The connected wagmi account as an `EvmAdapter`, or `null` when none is
 * connected. Wallet errors, including rejections and reverts, are thrown as
 * `WhiskError`s.
 */
export function useEvmAdapter(): EvmAdapter | null {
  const { address, isConnected } = useAccount();
  const wagmiConfig = useWagmiConfig();

  return useMemo<EvmAdapter | null>(
    () =>
      isConnected && address
        ? createWagmiEvmAdapter(wagmiConfig, address)
        : null,
    [address, isConnected, wagmiConfig],
  );
}

/** The adapter behind {@link useEvmAdapter}, for a given wagmi config. */
export function createWagmiEvmAdapter(
  wagmiConfig: Config,
  address: `0x${string}`,
): EvmAdapter {
  return {
    kind: "evm",
    address,

    async getChainId() {
      return getChainId(wagmiConfig);
    },

    async switchChain(chainId) {
      try {
        await switchChainAction(wagmiConfig, { chainId });
      } catch (cause) {
        throw toWhiskError(cause, "Failed to switch chain.");
      }
    },

    async supportsAtomicBatch(chainId) {
      try {
        const capabilities = await getCapabilities(wagmiConfig, {
          account: address,
          chainId,
        });
        const status = capabilities.atomic?.status;
        return status === "supported" || status === "ready";
      } catch {
        // Wallets without EIP-5792 fail this in many different ways. Any
        // failure means an atomic batch cannot be relied on, and calls sent
        // one by one always work.
        return false;
      }
    },

    async sendCalls(calls, options) {
      if (options?.atomic) {
        return sendAtomic(wagmiConfig, address, calls, options);
      }
      const hashes: `0x${string}`[] = [];
      for (const [index, call] of calls.entries()) {
        let hash: `0x${string}`;
        try {
          hash = await sendTransaction(wagmiConfig, {
            to: call.to,
            data: call.data,
            value: call.value,
            ...(call.maxFeePerGas !== undefined && {
              maxFeePerGas: call.maxFeePerGas,
            }),
            ...(call.maxPriorityFeePerGas !== undefined && {
              maxPriorityFeePerGas: call.maxPriorityFeePerGas,
            }),
          });
        } catch (cause) {
          throw toWhiskError(cause, "Failed to submit transaction.");
        }
        hashes.push(hash);
        options?.onSubmitted?.(hash, index);
        // Each call waits for the one before: a burn that races its approve
        // reverts. A second confirmation before the next call keeps a
        // load-balanced RPC that is a block behind from estimating it
        // against the old allowance.
        const last = index === calls.length - 1;
        try {
          const receipt = await waitForTransactionReceipt(wagmiConfig, {
            hash,
            confirmations: last ? 1 : 2,
          });
          if (receipt.status === "reverted") {
            throw toWhiskError(
              new Error(`Transaction reverted on-chain (${hash}).`),
              "Transaction reverted on-chain.",
              "reverted_onchain",
            );
          }
        } catch (cause) {
          throw toWhiskError(cause, "Failed waiting for receipt.");
        }
      }
      return { hashes };
    },

    async waitForReceipt(hash) {
      try {
        const receipt = await waitForTransactionReceipt(wagmiConfig, {
          hash,
        });
        return {
          status: receipt.status === "success" ? "success" : "reverted",
          blockNumber: receipt.blockNumber,
        };
      } catch (cause) {
        throw toWhiskError(cause, "Failed waiting for receipt.");
      }
    },
  };
}

async function sendAtomic(
  wagmiConfig: Config,
  address: `0x${string}`,
  calls: EvmCall[],
  options: SendCallsOptions,
): Promise<SendCallsResult> {
  // A batch has no per-call gas price, so a chain that needs one set, as
  // Arc does, sends the calls one by one instead.
  if (
    calls.some(
      (c) =>
        c.maxFeePerGas !== undefined || c.maxPriorityFeePerGas !== undefined,
    )
  ) {
    throw new WalletCapabilityError(
      "atomic_unsupported",
      "These calls need their own gas price, which a batch cannot carry.",
    );
  }
  let id: string;
  try {
    ({ id } = await sendCallsAction(wagmiConfig, {
      account: address,
      calls: calls.map((c) => ({ to: c.to, data: c.data, value: c.value })),
      forceAtomic: true,
    }));
  } catch (cause) {
    if (
      cause instanceof BaseError &&
      cause.walk((e) => (e as { code?: unknown }).code === 5760)
    ) {
      throw new WalletCapabilityError(
        "atomic_unsupported",
        "The wallet cannot send these calls as one batch.",
        cause,
      );
    }
    throw toWhiskError(cause, "Failed to submit the batch.");
  }
  let receipts: { transactionHash: `0x${string}` }[];
  try {
    ({ receipts = [] } = await waitForCallsStatus(wagmiConfig, { id }));
  } catch (cause) {
    throw toWhiskError(cause, "Failed waiting for the batch.");
  }
  const last = receipts[receipts.length - 1]?.transactionHash;
  if (!last) {
    throw toWhiskError(
      new Error(`The wallet's batch ${id} did not land.`),
      "The batch did not land.",
      "reverted_onchain",
    );
  }
  // EIP-5792 hands back a batch id, not a hash, so the hash is reported
  // once the batch is in a block. Receipts need not match calls one to one,
  // so the batch is reported under its last hash.
  options.onSubmitted?.(last, calls.length - 1);
  return { hashes: [last] };
}
