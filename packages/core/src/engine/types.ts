/**
 * Public engine types for `@usewhisk/core`.
 *
 * v1 surface — Send (same-chain), Bridge via CCTP V2 Forwarder, Refund.
 * Gateway / Swap / Unified Balance are deferred to roadmap.
 */
import type { Chain } from "../types/chain.js";
import type { Token } from "../types/token.js";
import type { Quote } from "../types/quote.js";
import type { ResolvedRecipient } from "../types/recipient.js";
import type { Step } from "../types/step.js";
import type { WhiskConfig } from "../types/config.js";
import type { WhiskError } from "../errors/errors.js";
import type { WhiskMetadata } from "../metadata/types.js";
import type { RefundInput } from "../refund/index.js";
import type { WhiskAdapter } from "./adapter.js";

export type {
  EvmAdapter,
  EvmCall,
  SendCallsResult,
  CallReceipt,
  SolanaAdapter,
  SolanaExtraSigner,
  SolanaTransactionReceipt,
  StarknetAdapter,
  StarknetTransactionReceipt,
  StellarAdapter,
  StellarTransactionReceipt,
  WhiskAdapter,
} from "./adapter.js";

export type QuoteParams = {
  sourceChain: Chain;
  destinationChain: Chain;
  recipient: ResolvedRecipient;
  /** Human-readable amount (e.g. `"1.50"`). */
  amount: string;
  adapter: WhiskAdapter;
  /** Bridges always use USDC regardless (CCTP V2 is USDC-only). */
  token?: Token;
};

export type SendParams = QuoteParams & {
  quote: Quote;
  /**
   * Destination-chain adapter — required only for cross-ecosystem
   * bridges that don't go through Circle's Forwarder (EVM → Solana is
   * the only such route in v1). For EVM → EVM and Solana → EVM
   * (Forwarder-relayed) the destination is handled without a second
   * signature.
   */
  destinationAdapter?: WhiskAdapter;
  /**
   * Optional correlation metadata. Merged with `WhiskConfig.defaultMetadata`
   * (per-call keys override defaults). Echoed in `SendResult.metadata`.
   * See {@link WhiskMetadata} for size and value constraints.
   */
  metadata?: WhiskMetadata;
};

export type SendStepListener = (step: Step) => void;

export type SendListeners = {
  onStep?: SendStepListener;
};

export type SendSuccess = {
  kind: "success";
  finalTxHash?: string;
  steps: Step[];
  /** Merged metadata (config defaults + per-call). Omitted if neither was set. */
  metadata?: WhiskMetadata;
};

export type SendFailure = {
  kind: "failure";
  error: WhiskError;
  steps: Step[];
  /**
   * Recovery snapshot — burn tx hash + source domain + intended recipient
   * so `engine.retry` can resume from the failed step.
   */
  raw?: unknown;
  /** Merged metadata (config defaults + per-call). Omitted if neither was set. */
  metadata?: WhiskMetadata;
};

export type SendResult = SendSuccess | SendFailure;

export type RetryParams = {
  failed: SendFailure;
  adapter: WhiskAdapter;
};

/**
 * Public-facing params for `engine.refund`. `merchantAdapter` is the wallet
 * that holds the funds being refunded — typically the destination wallet from
 * the original transfer.
 *
 * `destinationAdapter` is only required when the refund crosses ecosystems
 * to a Solana destination (the only route that needs a second signature).
 */
export type RefundParams = RefundInput & {
  merchantAdapter: WhiskAdapter;
  destinationAdapter?: WhiskAdapter;
};

/**
 * Refund result mirrors {@link SendResult} since a refund IS a send under the
 * hood. The `metadata` field carries the merchant's keys plus Whisk's
 * `__refundOfTxHash` (and `__refundReason` if provided) correlation values.
 */
export type RefundResult = SendResult;

export interface WhiskEngine {
  readonly config: WhiskConfig;
  resolve(input: string, chain: Chain): Promise<ResolvedRecipient>;
  quote(params: QuoteParams): Promise<Quote>;
  send(params: SendParams, listeners?: SendListeners): Promise<SendResult>;
  retry(params: RetryParams, listeners?: SendListeners): Promise<SendResult>;
  /**
   * Send funds back to the original payer of a previous transfer. Mechanically
   * a regular send from the merchant's adapter on `originalDestinationChain`
   * to the original sender's address on `refundDestinationChain`; the engine
   * stamps `__refundOfTxHash` (and `__refundReason` if provided) on the
   * resulting `metadata` so receipts and webhooks can correlate the refund
   * back to the original transfer.
   */
  refund(
    params: RefundParams,
    listeners?: SendListeners,
  ): Promise<RefundResult>;
}
