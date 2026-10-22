import type { SolanaAdapterFactory } from "../types.js";

export type SolanaNetwork = "mainnet-beta" | "devnet" | "testnet";

export type SolanaConfig = {
  network: SolanaNetwork;
  endpoint: string;
  autoConnect: boolean;
};

export type SolanaFactoryOptions = {
  /** Defaults to `devnet` while Solana support is in preview. */
  network?: SolanaNetwork;
  /** Defaults to the public endpoint, which is rate limited. Pass your own RPC in production. */
  endpoint?: string;
  /** Default `false`. */
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
