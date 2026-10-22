"use client";

import { useMemo } from "react";
import { useAccount, useConfig as useWagmiConfig } from "wagmi";
import {
  getChainId,
  sendTransaction,
  type Config,
  switchChain as switchChainAction,
  waitForTransactionReceipt,
} from "@wagmi/core";
import { toWhiskError, type EvmAdapter } from "@usewhisk/core";

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

    async sendCalls(calls, options) {
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
