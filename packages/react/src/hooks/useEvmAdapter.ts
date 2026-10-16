"use client";

import { useMemo } from "react";
import { useAccount, useConfig as useWagmiConfig } from "wagmi";
import {
  getChainId,
  sendTransaction,
  switchChain as switchChainAction,
  waitForTransactionReceipt,
} from "@wagmi/core";
import { toWhiskError, type EvmAdapter } from "@usewhisk/core";

/**
 * Build a Whisk `EvmAdapter` from the surrounding wagmi context.
 *
 * Returns `null` until the user is connected. Once an account is
 * present, the adapter exposes the contract the engine needs:
 *
 *   - `address`        live wagmi account
 *   - `getChainId`     live wagmi chainId
 *   - `switchChain`    wagmi's `switchChain` action
 *   - `sendCalls`      sequential `sendTransaction` per call, awaiting
 *                      each receipt before submitting the next so
 *                      `approve → burn` ordering is honoured on
 *                      wallets without EIP-5792 batching
 *   - `waitForReceipt` wagmi's `waitForTransactionReceipt` action
 *
 * Errors from the wallet (rejection, network drift, on-chain revert)
 * are converted to typed `WhiskError`s via `toWhiskError` so the engine
 * surfaces them with stable categories.
 */
export function useEvmAdapter(): EvmAdapter | null {
  const { address, isConnected } = useAccount();
  const wagmiConfig = useWagmiConfig();

  return useMemo<EvmAdapter | null>(() => {
    if (!isConnected || !address) return null;

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

      async sendCalls(calls) {
        const hashes: `0x${string}`[] = [];
        for (const call of calls) {
          let hash: `0x${string}`;
          try {
            hash = await sendTransaction(wagmiConfig, {
              to: call.to,
              data: call.data,
              value: call.value,
            });
          } catch (cause) {
            throw toWhiskError(cause, "Failed to submit transaction.");
          }
          hashes.push(hash);
          // Wait for each tx to be mined before the next — most
          // wallets bump the nonce immediately, but a CCTP burn that
          // races its approve will revert. Keep it sequential.
          try {
            const receipt = await waitForTransactionReceipt(wagmiConfig, {
              hash,
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
  }, [address, isConnected, wagmiConfig]);
}
