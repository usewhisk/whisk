"use client";

import { useMemo } from "react";
import type { StarknetWindowObject } from "@starknet-io/get-starknet-core";
import {
  getChain,
  getStarknetTransactionStatus,
  toWhiskError,
  type StarknetAdapter,
} from "@usewhisk/core";
import {
  STARKNET_CHAINS,
  type StarknetConfig,
} from "../config/adapters/starknet.js";
import { useStarknetWallet } from "../provider/starknetContext.js";

/**
 * The connected Starknet wallet as a `StarknetAdapter`, or `null` when no
 * wallet is connected or `config.wallets` has no `starknet()` factory.
 * Starknet accounts multicall, so `[approve, burn]` goes out as one atomic
 * transaction.
 */
export function useStarknetAdapter(): StarknetAdapter | null {
  const starknet = useStarknetWallet();

  return useMemo<StarknetAdapter | null>(() => {
    if (!starknet || !starknet.wallet || !starknet.address) return null;
    return createStarknetAdapter(
      starknet.wallet,
      starknet.address,
      starknet.config,
    );
  }, [starknet]);
}

const POLL_MS = 3_000;
const CONFIRM_TIMEOUT_MS = 10 * 60_000;

export function createStarknetAdapter(
  wallet: StarknetWindowObject,
  address: string,
  config: StarknetConfig,
): StarknetAdapter {
  const chain = getChain(STARKNET_CHAINS[config.network]);

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
        const hash = (result as { transaction_hash?: string }).transaction_hash;
        if (!hash) {
          throw new Error("Wallet returned no transaction_hash.");
        }
        return { hashes: [hash] };
      } catch (cause) {
        throw toWhiskError(cause, "Failed to submit Starknet calls.");
      }
    },

    async confirmTransaction(hash) {
      if (chain.ecosystem !== "starknet") {
        throw toWhiskError(
          new Error(`${chain.id} is not a Starknet chain.`),
          "Failed waiting for Starknet confirmation.",
        );
      }
      const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const status = await getStarknetTransactionStatus(chain, hash, {
          rpcUrls: [config.rpcUrl],
        }).catch((cause: unknown) => {
          throw toWhiskError(
            cause,
            "Failed waiting for Starknet confirmation.",
          );
        });
        if (status.state !== "pending") {
          return { status: status.state, blockNumber: status.blockNumber };
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      throw toWhiskError(
        new Error(`${hash} was not accepted on ${chain.id} within 10 minutes.`),
        "Failed waiting for Starknet confirmation.",
      );
    },
  };
}
