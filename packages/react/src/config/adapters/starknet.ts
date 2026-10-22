/**
 * Starknet wallets come from `@starknet-io/get-starknet-core`; the RPC is
 * used to confirm transactions.
 */
import { getChain } from "@usewhisk/core";
import type { StarknetAdapterFactory } from "../types.js";

export type StarknetNetwork = "mainnet" | "sepolia";

export type StarknetConfig = {
  network: StarknetNetwork;
  /** Expected chainId felt, compared against the wallet's live value. */
  chainId: string;
  /** Polled for transaction receipts. */
  rpcUrl: string;
  /** Reserved. `WhiskProvider` does not read it. */
  autoConnect: boolean;
};

export type StarknetFactoryOptions = {
  /** Defaults to `sepolia`. */
  network?: StarknetNetwork;
  /** Override the Starknet RPC. Defaults to the public endpoint. */
  rpcUrl?: string;
  /** Override the chainId felt. Defaults to the SN_MAIN / SN_SEPOLIA shortstring. */
  chainId?: string;
  autoConnect?: boolean;
};

export const STARKNET_CHAIN_IDS: Record<StarknetNetwork, string> = {
  mainnet: "0x534e5f4d41494e", // SN_MAIN
  sepolia: "0x534e5f5345504f4c4941", // SN_SEPOLIA
};

export const STARKNET_CHAINS = {
  mainnet: "Starknet",
  sepolia: "Starknet_Sepolia",
} as const satisfies Record<StarknetNetwork, string>;

export function starknet(
  options: StarknetFactoryOptions = {},
): StarknetAdapterFactory {
  const network = options.network ?? "sepolia";
  const config: StarknetConfig = {
    network,
    chainId: options.chainId ?? STARKNET_CHAIN_IDS[network],
    rpcUrl:
      options.rpcUrl ?? getChain(STARKNET_CHAINS[network]).defaultRpcUrls[0]!,
    autoConnect: options.autoConnect ?? false,
  };
  return { kind: "starknet", config };
}
