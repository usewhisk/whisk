import type { Chain, ChainNetwork } from "./chain.js";
import type { Token } from "./token.js";
import type { FeePolicy, FeeBearer } from "./fee.js";
import type { Resolver } from "./resolver.js";
import type { WhiskMetadata } from "../metadata/types.js";

export type WhiskMode = ChainNetwork;

export type WhiskConfig = {
  chains: Chain[];

  defaultSourceChain?: Chain;

  defaultDestinationChain?: Chain;

  token?: Token;

  resolver?: Resolver;

  feePolicy?: FeePolicy;

  /** Who absorbs the bridge fees. Defaults to `"sender"`. See {@link FeeBearer}. */
  feeBearer?: FeeBearer;

  /**
   * Default correlation metadata merged into every send. Per-call
   * `SendParams.metadata` overrides on key conflict. See
   * {@link WhiskMetadata} for size and value constraints.
   *
   * Stored client-side in localStorage alongside the recovery snapshot.
   * Do not put PII, payment credentials, or anything sensitive here.
   */
  defaultMetadata?: WhiskMetadata;

  /**
   * Override the default public RPC endpoints. Pass an array to install a
   * viem `fallback` transport that re-ranks by latency.
   */
  rpcUrls?: Partial<Record<Chain, string | string[]>>;

  /**
   * Use Circle's Forwarder Service to submit the destination mint on
   * cross-chain bridges. Default `true`. Whisk encodes the canonical
   * `cctp-forward` hookData (32-byte magic prefix) when this is enabled.
   */
  useForwarder?: boolean;

  /**
   * Used for every Iris request. Defaults to the global `fetch`. Pass one
   * to route Iris through a proxy, or to stub Circle in tests.
   */
  fetch?: typeof fetch;

  /** Inferred from `chains` when omitted. Mixed networks default to `"testnet"` with a warning. */
  mode?: WhiskMode;

  appLabel?: string;
};
