/**
 * Solana adapter factory — placeholder for v1.
 *
 * The factory exists so ConnectModal can render a "Solana — coming
 * soon" entry alongside EVM connectors, but it is not mounted by
 * `WhiskProvider` today. Solana send / bridge support arrives in v1.1
 * (see ROADMAP.md). When it ships, the factory will start producing a
 * working adapter and the provider will mount the wallet-adapter-react
 * tree.
 */
import type { SolanaAdapterFactory } from "../types.js";

export type SolanaNetwork = "mainnet-beta" | "devnet" | "testnet";

export type SolanaConfig = {
  network: SolanaNetwork;
  endpoint: string;
  /** Reserved — `WhiskProvider` ignores this in v1. */
  autoConnect: boolean;
};

export type SolanaFactoryOptions = {
  /** Defaults to `devnet` while Solana support is in preview. */
  network?: SolanaNetwork;
  /** Defaults to the public network endpoint — pass a paid RPC for production. */
  endpoint?: string;
  /** Default `false`. Has no effect until Solana support lands in v1.1. */
  autoConnect?: boolean;
};

const NETWORK_RPC: Record<SolanaNetwork, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

export function solana(
  options: SolanaFactoryOptions = {},
): SolanaAdapterFactory {
  const network = options.network ?? "devnet";
  const config: SolanaConfig = {
    network,
    endpoint: options.endpoint ?? NETWORK_RPC[network],
    autoConnect: options.autoConnect ?? false,
  };
  return { kind: "solana", config };
}
