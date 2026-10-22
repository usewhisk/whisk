"use client";

import {
  addressResolver,
  composeResolvers,
  getChain,
  type Resolver,
} from "@usewhisk/core";
import {
  createEnsResolver,
  ensResolver,
  sepoliaEnsResolver,
  DEFAULT_ENS_RPC_URLS,
  DEFAULT_ENS_SEPOLIA_RPC_URLS,
  type EnsResolverChain,
  type EnsResolverOptions,
} from "./ensResolver.js";

export {
  createEnsResolver,
  ensResolver,
  sepoliaEnsResolver,
  DEFAULT_ENS_RPC_URLS,
  DEFAULT_ENS_SEPOLIA_RPC_URLS,
};
export type { EnsResolverChain, EnsResolverOptions };

export type CreateDefaultResolverOptions = Omit<EnsResolverOptions, "chain">;

/**
 * Addresses, then ENS. A testnet destination tries Sepolia ENS before
 * mainnet ENS; a mainnet destination uses mainnet ENS only.
 */
export function createDefaultResolver(
  options: CreateDefaultResolverOptions = {},
): Resolver {
  const mainnet = composeResolvers(
    [addressResolver, createEnsResolver({ ...options, chain: "mainnet" })],
    { name: "default-mainnet" },
  );
  const testnet = composeResolvers(
    [
      addressResolver,
      createEnsResolver({ ...options, chain: "sepolia" }),
      createEnsResolver({ ...options, chain: "mainnet" }),
    ],
    { name: "default-testnet" },
  );
  return {
    name: "default",
    matches: (input) => mainnet.matches(input),
    resolve: (input, ctx) =>
      getChain(ctx.chain).network === "testnet"
        ? testnet.resolve(input, ctx)
        : mainnet.resolve(input, ctx),
  };
}

export const defaultResolver: Resolver = createDefaultResolver();
