/** Stellar wallets come from `@creit.tech/stellar-wallets-kit`. */
import type { StellarAdapterFactory } from "../types.js";

export type StellarNetwork = "public" | "testnet";

export type StellarConfig = {
  network: StellarNetwork;
  /** Derived from `network` when not given. */
  networkPassphrase: string;
  /** Soroban RPC URL. Defaults to the network's public endpoint. */
  rpcUrl: string;
  /** Reserved. `WhiskProvider` does not read it. */
  autoConnect: boolean;
};

export type StellarFactoryOptions = {
  /** Defaults to `testnet`. */
  network?: StellarNetwork;
  /** Override the Stellar RPC. Defaults to the network's public endpoint. */
  rpcUrl?: string;
  /** Override the network passphrase. Defaults match Stellar's standard strings. */
  networkPassphrase?: string;
  /** Default `false`. */
  autoConnect?: boolean;
};

export const STELLAR_NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  public: "Public Global Stellar Network ; September 2015",
  testnet: "Test SDF Network ; September 2015",
};

const NETWORK_RPC: Record<StellarNetwork, string> = {
  public: "https://mainnet.sorobanrpc.com",
  testnet: "https://soroban-testnet.stellar.org",
};

export function stellar(
  options: StellarFactoryOptions = {},
): StellarAdapterFactory {
  const network = options.network ?? "testnet";
  const config: StellarConfig = {
    network,
    networkPassphrase:
      options.networkPassphrase ?? STELLAR_NETWORK_PASSPHRASES[network],
    rpcUrl: options.rpcUrl ?? NETWORK_RPC[network],
    autoConnect: options.autoConnect ?? false,
  };
  return { kind: "stellar", config };
}
