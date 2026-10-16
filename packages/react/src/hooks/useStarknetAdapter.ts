"use client";

import { useMemo } from "react";
import { RpcProvider } from "starknet";
import { toWhiskError, type StarknetAdapter } from "@usewhisk/core";
import { useStarknetWallet } from "../provider/starknetContext.js";

/**
 * Build a Whisk `StarknetAdapter` from the surrounding Starknet wallet
 * context (mounted by `WhiskProvider` when a `starknet()` factory is in
 * `config.wallets`).
 *
 * Returns `null` until the user picks + connects a wallet via the
 * `ConnectModal`. Once connected the adapter:
 *
 *   - `address`             → connected account felt
 *   - `getChainId`          → `wallet_requestChainId` RPC call
 *   - `submitCalls`         → `wallet_addInvokeTransaction` — Starknet
 *                              accounts natively multicall, so the
 *                              engine can pass `[approve, burn]` and
 *                              get atomic execution in one tx
 *   - `confirmTransaction`  → polls Starknet RPC until the tx lands
 *                              or fails
 */
export function useStarknetAdapter(): StarknetAdapter | null {
  const starknet = useStarknetWallet();

  return useMemo<StarknetAdapter | null>(() => {
    if (!starknet || !starknet.wallet || !starknet.address) return null;
    const { wallet, address, config } = starknet;
    const rpc = new RpcProvider({ nodeUrl: config.rpcUrl });

    return {
      kind: "starknet",
      address,

      async getChainId() {
        try {
          const chainId = await wallet.request({
            type: "wallet_requestChainId",
          });
          return chainId;
        } catch (cause) {
          throw toWhiskError(cause, "Failed to read Starknet chainId.");
        }
      },

      async submitCalls(calls) {
        try {
          const result = await wallet.request({
            type: "wallet_addInvokeTransaction",
            params: {
              calls: calls.map((c) => ({
                contract_address: c.contractAddress,
                entry_point: c.entrypoint,
                calldata: c.calldata,
              })),
            },
          });
          const hash = (result as { transaction_hash?: string })
            .transaction_hash;
          if (!hash) {
            throw new Error("Wallet returned no transaction_hash.");
          }
          return { hashes: [hash] };
        } catch (cause) {
          throw toWhiskError(cause, "Failed to submit Starknet calls.");
        }
      },

      async confirmTransaction(hash) {
        try {
          const receipt = await rpc.waitForTransaction(hash, {
            retryInterval: 3000,
          });
          const status =
            "isSuccess" in receipt && receipt.isSuccess()
              ? "success"
              : "reverted";
          const blockNumber =
            (receipt as { block_number?: number }).block_number ?? 0;
          return { status, blockNumber };
        } catch (cause) {
          throw toWhiskError(
            cause,
            "Failed waiting for Starknet confirmation.",
          );
        }
      },
    };
  }, [starknet]);
}
