"use client";

import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import {
  ResolverError,
  addressFormat,
  cleanErrorMessage,
  getChain,
  type CctpChain,
  type Resolver,
} from "@usewhisk/core";

export type EnsResolverChain = "mainnet" | "sepolia";

// viem's default `eth.merkle.io` fails CORS in browsers. These are all CORS-friendly.
export const DEFAULT_ENS_RPC_URLS = [
  "https://eth.llamarpc.com",
  "https://ethereum-rpc.publicnode.com",
  "https://rpc.ankr.com/eth",
  "https://eth.drpc.org",
  "https://cloudflare-eth.com",
] as const;

export const DEFAULT_ENS_SEPOLIA_RPC_URLS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.ankr.com/eth_sepolia",
  "https://eth-sepolia.public.blastapi.io",
  "https://sepolia.drpc.org",
] as const;

export type EnsResolverOptions = {
  chain?: EnsResolverChain;
  /** One URL, or several tried by latency through viem's `fallback`. Defaults to the lists above. */
  rpcUrl?: string | string[];
  /** Reuse an existing viem client (e.g. from wagmi) instead of constructing one. */
  client?: PublicClient;
  /**
   * When the name has no address for an EVM destination's coinType, use its
   * Ethereum (coinType 60) address. Defaults to `true`, as in MetaMask and
   * Rainbow.
   */
  fallbackToEthAddress?: boolean;
};

/** ENS resolver with ENSIP-11 multichain coinType lookup. Always queries L1. */
export function createEnsResolver(options: EnsResolverOptions = {}): Resolver {
  const ensChain: EnsResolverChain = options.chain ?? "mainnet";
  const fallbackToEthAddress = options.fallbackToEthAddress ?? true;
  let cachedClient: PublicClient | undefined = options.client;
  const getClient = (): PublicClient => {
    if (cachedClient) return cachedClient;
    const urls = resolveRpcList(ensChain, options.rpcUrl);
    const transport =
      urls.length > 1
        ? fallback(
            urls.map((u) => http(u)),
            { rank: true },
          )
        : http(urls[0]);
    cachedClient = createPublicClient({
      chain: ensChain === "sepolia" ? sepolia : mainnet,
      transport,
    });
    return cachedClient;
  };

  const name = `ens:${ensChain}`;

  return {
    name,
    // Any `<label>.<tld>`, since DNS-imported TLDs resolve too.
    matches: (input) => /\.[a-z0-9]{2,}$/i.test(input.trim()),
    resolve: async (input, ctx) => {
      const trimmed = input.trim();
      let normalized: string;
      try {
        normalized = normalize(trimmed);
      } catch {
        return null;
      }

      const destination = getChain(ctx.chain);
      const { pattern } = addressFormat(ctx.chain);
      const destinationCoinType = ensCoinTypeForChain(destination);
      // Without a coin type, viem returns the name's Ethereum address, which
      // a Starknet felt check accepts. USDC minted there would be lost.
      if (destinationCoinType === undefined) return null;

      const client = getClient();

      const primary = await safeGetEnsAddress(
        client,
        normalized,
        destinationCoinType,
      );
      if (primary && pattern.test(primary)) {
        return { address: primary, chain: ctx.chain };
      }

      // An EVM address is the same account on every EVM chain.
      if (
        fallbackToEthAddress &&
        destination.ecosystem === "evm" &&
        destinationCoinType !== 60
      ) {
        const fallbackAddr = await safeGetEnsAddress(client, normalized, 60);
        if (fallbackAddr && pattern.test(fallbackAddr)) {
          return { address: fallbackAddr, chain: ctx.chain };
        }
      }

      return null;
    },
  };
}

async function safeGetEnsAddress(
  client: PublicClient,
  name: string,
  coinType: number | undefined,
): Promise<string | null> {
  try {
    const addr = await client.getEnsAddress({
      name,
      ...(coinType !== undefined ? { coinType: BigInt(coinType) } : {}),
    });
    return addr ?? null;
  } catch (err) {
    throw new ResolverError(
      "ens",
      err instanceof Error
        ? cleanErrorMessage(err.message)
        : "ENS lookup failed",
      err,
    );
  }
}

function resolveRpcList(
  chain: EnsResolverChain,
  rpcUrl: EnsResolverOptions["rpcUrl"],
): string[] {
  const defaults =
    chain === "sepolia" ? DEFAULT_ENS_SEPOLIA_RPC_URLS : DEFAULT_ENS_RPC_URLS;
  if (!rpcUrl) return [...defaults];
  if (typeof rpcUrl === "string") return [rpcUrl];
  return rpcUrl.length > 0 ? [...rpcUrl] : [...defaults];
}

export const ensResolver: Resolver = createEnsResolver();

export const sepoliaEnsResolver: Resolver = createEnsResolver({
  chain: "sepolia",
});

// ENSIP-11: mainnet → 60, other EVM → unsigned (0x80000000 | chainId), Solana → 501.
function ensCoinTypeForChain(chain: CctpChain): number | undefined {
  if (chain.ecosystem === "evm") {
    if (chain.evmChainId === 1) return 60;
    // `|` returns a signed int32, so coerce to unsigned for chain ids of 2^31 and up.
    return (0x80000000 | chain.evmChainId) >>> 0;
  }
  if (chain.ecosystem === "solana") {
    return 501;
  }
  return undefined;
}
