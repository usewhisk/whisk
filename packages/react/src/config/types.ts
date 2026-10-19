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
  /** Opaque wagmi `Config` — passed to `WagmiProvider`. */
  config: unknown;
};

export type SolanaAdapterFactory = {
  kind: "solana";
  config?: unknown;
};

export type StellarAdapterFactory = {
  kind: "stellar";
  /** {@link StellarConfig} — opaque to the type system so the kit dep is lazy. */
  config: unknown;
};

export type StarknetAdapterFactory = {
  kind: "starknet";
  /** {@link StarknetConfig} — opaque so the wallet SDK stays lazy. */
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
  /** Who pays bridge fees. Default `"receiver"`. Set `"sender"` so the recipient receives the full amount. */
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
