/**
 * Starknet adapter factory.
 *
 * Wraps `@starknet-io/get-starknet-core` for wallet discovery (Argent X,
 * Braavos, Argent Mobile via WalletConnect, etc.) and Starknet RPC for
 * transaction confirmation. Per-wallet selection happens later via the
 * `ConnectModal`.
 */
import { getChain } from "@usewhisk/core";
import type { StarknetAdapterFactory } from "../types.js";

export type StarknetNetwork = "mainnet" | "sepolia";

export type StarknetConfig = {
  network: StarknetNetwork;
  /** Expected chainId felt — engine compares against wallet's live value. */
  chainId: string;
  /** Starknet RPC URL — used to poll for tx receipts. */
  rpcUrl: string;
  autoConnect: boolean;
};

export type StarknetFactoryOptions = {
  /** Defaults to `sepolia` for previewing; flip to `mainnet` in production. */
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
