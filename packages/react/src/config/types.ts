import type { InflightStore } from "@usewhisk/core";
import type {
  Chain,
  FeePolicy,
  FeeBearer,
  Resolver,
  Token,
} from "@usewhisk/core";

export type WalletAdapterFactory =
  | EvmAdapterFactory
  | SolanaAdapterFactory
  | StellarAdapterFactory
  | StarknetAdapterFactory;

export type EvmAdapterFactory = {
  kind: "evm";
  /** Opaque wagmi `Config`, passed to `WagmiProvider`. */
  config: unknown;
};

export type SolanaAdapterFactory = {
  kind: "solana";
  config?: unknown;
};

export type StellarAdapterFactory = {
  kind: "stellar";
  /** A `StellarConfig`, typed `unknown` so this file does not import the wallet kit. */
  config: unknown;
};

export type StarknetAdapterFactory = {
  kind: "starknet";
  /** A `StarknetConfig`, typed `unknown` so this file does not import the wallet SDK. */
  config: unknown;
};

export type WhiskClientConfig = {
  wallets: WalletAdapterFactory[];
  chains: Chain[];
  defaultSourceChain?: Chain;
  defaultDestinationChain?: Chain;
  token?: Token;
  resolver?: Resolver;
  feePolicy?: FeePolicy;
  /** Who pays bridge fees. Default `"sender"`, so the recipient receives the full amount. */
  feeBearer?: FeeBearer;
  rpcUrls?: Partial<Record<Chain, string | string[]>>;
  useForwarder?: boolean;
  appLabel?: string;
  /**
   * Where transfers are kept between the burn and the mint. Defaults to
   * `localStorage`, so a reload can resume them.
   */
  inflightStore?: InflightStore;
};

export type CreateWhiskConfigOptions = WhiskClientConfig;
