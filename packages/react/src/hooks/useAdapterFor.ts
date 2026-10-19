"use client";

import { useCallback } from "react";
import { getChain, type Chain, type WhiskAdapter } from "@usewhisk/core";
import { useEvmAdapter } from "./useEvmAdapter.js";
import { useSolanaAdapter } from "./useSolanaAdapter.js";
import { useStarknetAdapter } from "./useStarknetAdapter.js";
import { useStellarAdapter } from "./useStellarAdapter.js";

/** The connected wallet that can sign on a chain, or `null` if none is. */
export function useAdapterFor(): (chain: Chain) => WhiskAdapter | null {
  const evm = useEvmAdapter();
  const solana = useSolanaAdapter();
  const stellar = useStellarAdapter();
  const starknet = useStarknetAdapter();
  return useCallback(
    (chain: Chain) => {
      switch (getChain(chain).ecosystem) {
        case "solana":
          return solana;
        case "stellar":
          return stellar;
        case "starknet":
          return starknet;
        default:
          return evm;
      }
    },
    [evm, solana, stellar, starknet],
  );
}
