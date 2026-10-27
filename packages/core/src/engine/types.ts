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
import type { InflightRecord } from "../inflight/types.js";

export type {
  EvmAdapter,
  EvmCall,
  SendCallsOptions,
  SendCallsResult,
  CallReceipt,
  SolanaAdapter,
  SolanaExtraSigner,
  SolanaTransactionReceipt,
  StarknetAdapter,
  StarknetTransactionReceipt,
  StellarAdapter,
  StellarTransactionReceipt,
  StellarTrustline,
  WhiskAdapter,
} from "./adapter.js";

export type QuoteParams = {
  sourceChain: Chain;
  destinationChain: Chain;
  recipient: ResolvedRecipient;
  /** Human amount, e.g. `"1.50"`. */
  amount: string;
  adapter: WhiskAdapter;
  /**
   * The wallet that signs the mint when Circle does not forward it. The
   * route plan says when one is needed; for an EVM to EVM mint the source
   * wallet signs it.
   */
  destinationAdapter?: WhiskAdapter;
  /** Bridges always move USDC, the only token CCTP carries. */
  token?: Token;
  /**
   * Quote to a Starknet address with no account deployed yet. USDC sent
   * there waits for whoever deploys the account, so set this only once the
   * payer has confirmed the address is their own new wallet.
   */
  allowUndeployedRecipient?: boolean;
};

/**
 * The chains, recipient and amount all come from `quote`, the one the payer
 * confirmed. `send` refuses it once expired, or when fees rose past it.
 */
export type SendParams = {
  quote: Quote;
  adapter: WhiskAdapter;
  /** See {@link QuoteParams.destinationAdapter}. */
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
  /**
   * Called with the burn's tx hash as soon as the wallet returns it, before
   * any receipt wait. A caller keeping its own records should save it here.
   */
  onBurnSubmitted?: (txHash: string) => void;
};

/**
 * Whether the payer paid the `feePolicy` fee. `unpaid` with no `error` means
 * the fee was never asked for, because the burn or transfer did not land.
 * `amount` is the whole fee in USDC, as a decimal string.
 */
export type CustomFeeOutcome =
  | { status: "paid"; txHashes: `0x${string}`[]; amount: string }
  | {
      status: "unpaid";
      amount: string;
      error?: WhiskError;
      /** Shares that landed before the payer stopped, if any. */
      txHashes?: `0x${string}`[];
    };

export type SendSuccess = {
  kind: "success";
  finalTxHash?: string;
  steps: Step[];
  /** Present when a `feePolicy` charged this transfer. */
  customFee?: CustomFeeOutcome;
  /** Merged metadata (config defaults + per-call). Omitted if neither was set. */
  metadata?: WhiskMetadata;
};

export type SendFailure = {
  kind: "failure";
  error: WhiskError;
  steps: Step[];
  /** The executor's recovery snapshot: burn tx hash, domains, recipient. */
  raw?: unknown;
  /** Present when a `feePolicy` charged this transfer. */
  customFee?: CustomFeeOutcome;
  /** Merged metadata (config defaults + per-call). Omitted if neither was set. */
  metadata?: WhiskMetadata;
};

export type SendResult = SendSuccess | SendFailure;

export type MaxSendable = {
  /** Ready for the amount field and `quote`. */
  amount: string;
  /** USDC subunits. */
  balance: bigint;
  /** USDC subunits kept back for gas. */
  gasReserve: bigint;
};

export type ResumeOptions = {
  /**
   * Signs the mint when Circle does not, or when its relayer failed. Not
   * needed for a transfer Circle forwards.
   */
  destinationAdapter?: WhiskAdapter;
};

export type ResumeFromTxParams = ResumeOptions & {
  sourceChain: Chain;
  /** The burn transaction on the source chain. */
  txHash: string;
};

/**
 * `merchantAdapter` holds the funds being refunded, usually the destination
 * wallet of the original transfer. `destinationAdapter` is needed when
 * Circle does not forward the refund's mint, as in {@link SendParams}.
 */
export type RefundParams = RefundInput & {
  merchantAdapter: WhiskAdapter;
  destinationAdapter?: WhiskAdapter;
};

/**
 * A refund is a send, so it returns a {@link SendResult}. Its `metadata`
 * adds `__refundOfTxHash`, and `__refundReason` when given.
 */
export type RefundResult = SendResult;

export interface WhiskEngine {
  readonly config: WhiskConfig;
  resolve(input: string, chain: Chain): Promise<ResolvedRecipient>;
  quote(params: QuoteParams): Promise<Quote>;
  send(params: SendParams, listeners?: SendListeners): Promise<SendResult>;
  /**
   * The USDC `address` holds on `chain`, in subunits. `null` on Solana,
   * Stellar and Starknet, where Whisk does not read balances.
   */
  balance(params: { chain: Chain; address: string }): Promise<bigint | null>;
  /**
   * The largest amount `adapter` can send on this route: its balance, less
   * the fees the payer covers and, on Arc, the gas paid from the same USDC.
   * `null` where the balance cannot be read.
   */
  maxSendable(params: Omit<QuoteParams, "amount">): Promise<MaxSendable | null>;
  /** Transfers in the engine's `inflightStore`, oldest first. */
  inflight(): Promise<readonly InflightRecord[]>;
  /**
   * Removes a transfer from the store, once the payer has seen it finish or
   * chosen to drop it. Burned records are kept until this is called.
   */
  dismiss(id: string): Promise<void>;
  /**
   * Finishes a transfer from its record without signing the burn again:
   * waits for the attestation, re-attests an expired one, and mints unless
   * Circle forwards it or the destination already received it.
   */
  resume(
    record: InflightRecord,
    options?: ResumeOptions,
    listeners?: SendListeners,
  ): Promise<SendResult>;
  /** As `resume`, from the burn's tx hash alone, such as a receipt link. */
  resumeFromTx(
    params: ResumeFromTxParams,
    listeners?: SendListeners,
  ): Promise<SendResult>;
  /**
   * Sends funds back to the payer of an earlier transfer: a regular send
   * from the merchant's adapter on `originalDestinationChain` to the payer
   * on `refundDestinationChain`. The result's `metadata` carries
   * `__refundOfTxHash` so receipts and webhooks can tie it to the original.
   */
  refund(
    params: RefundParams,
    listeners?: SendListeners,
  ): Promise<RefundResult>;
}
