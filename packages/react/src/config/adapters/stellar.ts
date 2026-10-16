/**
 * Stellar adapter factory.
 *
 * Wraps `@creit.tech/stellar-wallets-kit` for browser wallets (Freighter,
 * Albedo, xBull, Lobstr, Hana, Rabet, …). The factory holds the config
 * the `WhiskProvider` needs to mount the kit once; per-wallet selection
 * happens later via the `ConnectModal`.
 */
import type { StellarAdapterFactory } from "../types.js";

export type StellarNetwork = "public" | "testnet";

export type StellarConfig = {
  network: StellarNetwork;
  /** Stellar network passphrase — derived from `network` if unset. */
  networkPassphrase: string;
  /** Soroban RPC URL — defaults to the network's public endpoint. */
  rpcUrl: string;
  /** When `true`, the kit reconnects to the previously-selected wallet. */
  autoConnect: boolean;
};

export type StellarFactoryOptions = {
  /** Defaults to `testnet` for previewing; flip to `public` in production. */
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
