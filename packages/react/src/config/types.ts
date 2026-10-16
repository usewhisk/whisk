import type {
  Chain,
  FeePolicy,
  FeeBearer,
  Resolver,
  Token,
  WhiskMode,
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
  /**
   * Whisk app key from the console. Format: `wsk_pk_test_...` or
   * `wsk_pk_live_...`. Get one at https://cloud.usewhisk.xyz.
   *
   * Optional today with a 30-day grace warning; will become required
   * once the transition period ends. Without it, the widget still
   * functions but usage isn't tracked and the fee tier can't be
   * resolved.
   */
  appId?: string;
  /**
   * Base URL of the Whisk Cloud API. Only override for self-hosting
   * or testing against a staging deployment.
   * @default "https://cloud.usewhisk.xyz"
   */
  cloudBaseUrl?: string;
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
  /** Inferred from `chains` when omitted. */
  mode?: WhiskMode;
  appLabel?: string;
};

export type CreateWhiskConfigOptions = WhiskClientConfig;
