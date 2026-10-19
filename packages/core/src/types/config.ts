import type { InflightStore } from "../inflight/types.js";
import type { Chain } from "./chain.js";
import type { Token } from "./token.js";
import type { FeePolicy, FeeBearer } from "./fee.js";
import type { Resolver } from "./resolver.js";
import type { WhiskMetadata } from "../metadata/types.js";

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
   * Where transfers are kept between the burn and the mint, so a reload can
   * resume them. Defaults to memory, which lasts as long as the engine.
   */
  inflightStore?: InflightStore;

  /**
   * Circle's forwarding fee level. Defaults to `high`, or `med` into
   * Ethereum, where `high` costs about 0.30 USDC more.
   */
  forwarderFeeLevel?: "med" | "high";

  /**
   * Used for every Iris request and for the `getMinFeeAmount` read on
   * Standard burns. Defaults to the global `fetch`. Pass one to route Circle
   * through a proxy, or to stub it in tests.
   */
  fetch?: typeof fetch;

  appLabel?: string;
};
