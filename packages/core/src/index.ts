/**
 * `@usewhisk/core` — framework-agnostic engine, types, errors, and
 * helpers for the Whisk USDC widget.
 *
 * v1 ships: Send (same-chain) and Bridge (CCTP V2 via Forwarder), with
 * Refund mechanically built on Send/Bridge.
 *
 * Most apps will consume `@usewhisk/react`. Reach for this package
 * directly only when building a Whisk frontend in something other than
 * React, or when running engine logic on a server.
 */

/* --------------------------------------------------------------------- *
 *  Engine
 * --------------------------------------------------------------------- */

export { createWhisk } from "./engine/createWhisk.js";
export type {
  WhiskEngine,
  WhiskAdapter,
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
  QuoteParams,
  SendParams,
  SendListeners,
  SendStepListener,
  SendResult,
  SendSuccess,
  SendFailure,
  MaxSendable,
  ResumeFromTxParams,
  ResumeOptions,
  RefundParams,
  RefundResult,
} from "./engine/types.js";

/** Amount helpers — convert between USDC strings and 6-decimal bigint subunits. */
export {
  USDC_DECIMALS,
  formatUsdcAmount,
  parseUsdcAmount,
} from "./engine/amount.js";

/* --------------------------------------------------------------------- *
 *  Refund correlation primitives
 *
 *  Used by `engine.refund` and exposed for merchants who mint refund
 *  metadata themselves.
 * --------------------------------------------------------------------- */

export {
  REFUND_OF_TX_KEY,
  REFUND_REASON_KEY,
  buildRefundMetadata,
  validateRefundInput,
} from "./refund/index.js";
export type { RefundInput, RefundPlan } from "./refund/index.js";

/* --------------------------------------------------------------------- *
 *  Webhook signing + verification
 *
 *  HMAC-SHA256 over Stripe-style `${timestamp}.${rawBody}`. Runtime-
 *  agnostic (Node 18+, Deno, Bun, Workers, Edge / Fluid Compute).
 *  Server-side only — never put `secret` in client code.
 * --------------------------------------------------------------------- */

export {
  signWebhook,
  verifyWebhook,
  WHISK_SIGNATURE_HEADER,
  WHISK_TIMESTAMP_HEADER,
  WHISK_WEBHOOK_VERSION,
  DEFAULT_TIMESTAMP_TOLERANCE_MS,
} from "./webhooks/index.js";
export type {
  WebhookEnvelope,
  SignWebhookOptions,
  SignWebhookResult,
  VerifyWebhookOptions,
  WebhookVerifyResult,
  WebhookVerifyError,
} from "./webhooks/index.js";

/* --------------------------------------------------------------------- *
 *  Types
 * --------------------------------------------------------------------- */

export type {
  Chain,
  ChainKind,
  ChainNetwork,
  Token,
  ResolvedRecipient,
  Route,
  FeePolicy,
  FeeBearer,
  FeeEntry,
  FeeEntryKind,
  FeeBreakdown,
  StepName,
  StepState,
  Step,
  Quote,
  WhiskConfig,
  Resolver,
  ResolverContext,
  WhiskState,
  WhiskStateKind,
} from "./types/index.js";
export {
  DEFAULT_FEE_BEARER,
  DEFAULT_TOKEN,
  isBridgeRoute,
  isSendRoute,
} from "./types/index.js";

/* --------------------------------------------------------------------- *
 *  Errors
 * --------------------------------------------------------------------- */

export {
  WhiskError,
  NoAdapterError,
  WrongChainError,
  InsufficientBalanceError,
  InvalidAddressError,
  ResolverError,
  BridgeStepError,
  UserRejectedError,
  NetworkError,
  WalletCapabilityError,
  OnchainRevertError,
  ConfigError,
  NetworkMismatchError,
  RouteUnavailableError,
  QuoteChangedError,
  QuoteExpiredError,
  toWhiskError,
  cleanErrorMessage,
} from "./errors/index.js";
export type {
  WhiskErrorCode,
  WhiskErrorCategory,
  WhiskErrorOptions,
  RouteUnavailableReason,
} from "./errors/index.js";

/* --------------------------------------------------------------------- *
 *  Chains, routing, resolvers
 * --------------------------------------------------------------------- */

export {
  CHAINS,
  addressFormat,
  chainByDomain,
  chainByEvmChainId,
  chainsByNetwork,
  explorerAddressUrl,
  explorerTxUrl,
  getChain,
  isChainId,
  tryChainByEvmChainId,
} from "./chains/index.js";
export type { AddressFormat } from "./chains/index.js";
export type { CctpChain } from "@usewhisk/cctp";
export {
  connectedEcosystems,
  decideRoute,
  planRoute,
} from "./routing/index.js";
export type { PlanRouteInput, RouteMint, RoutePlan } from "./routing/index.js";

export { addressResolver, composeResolvers } from "./resolvers/index.js";

/* --------------------------------------------------------------------- *
 *  Fees
 *
 *  `splitCustomFee` + `WHISK_TREASURY_ADDRESS` make the 90/10 merchant
 *  fee split inspectable. The end user always pays the configured
 *  `feePolicy.value`; the split decides distribution only.
 * --------------------------------------------------------------------- */

export {
  buildCustomFeeEntries,
  sumFees,
  sumForwarderFees,
  sumProtocolFees,
  BPS_DENOMINATOR,
  WHISK_TREASURY_ADDRESS,
  WHISK_TREASURY_BPS,
  splitCustomFee,
} from "./fees/index.js";
export type { CustomFeeSplit } from "./fees/index.js";

/* --------------------------------------------------------------------- *
 *  State machine
 * --------------------------------------------------------------------- */

export { reduce, initialState, initialSteps } from "./state/index.js";
export type { WhiskAction } from "./state/index.js";

/* --------------------------------------------------------------------- *
 *  Metadata correlation
 * --------------------------------------------------------------------- */

export {
  METADATA_MAX_BYTES,
  METADATA_RESERVED_PREFIX,
  mergeMetadata,
  validateMetadata,
} from "./metadata/index.js";
export type { WhiskMetadata } from "./metadata/index.js";

/* --------------------------------------------------------------------- *
 *  Recovery — universal
 *
 *  Iris polling, MessageTransmitter helpers, receipt projection. Runs
 *  on every runtime that exposes `fetch` (Node 18+, Deno, Bun, Workers,
 *  Edge / Fluid Compute).
 * --------------------------------------------------------------------- */

export {
  fetchAttestationOnce,
  pollAttestation,
  getIrisBaseUrl,
  IRIS_MAINNET_URL,
  IRIS_SANDBOX_URL,
  buildReceiveMessageCall,
  messageTransmitterAddress,
  manualMintExplorerUrl,
  RECEIVE_MESSAGE_ABI,
  EVM_MAINNET_MESSAGE_TRANSMITTER,
  EVM_TESTNET_MESSAGE_TRANSMITTER,
  SOLANA_MESSAGE_TRANSMITTER,
  deriveReceiptView,
  describeReceiptChains,
  RECEIPT_STAGE_LABELS,
  RECEIPT_STAGE_HELP,
} from "./recovery/index.js";
export type {
  IrisMessage,
  IrisStatus,
  FetchAttestationOptions,
  PollAttestationOptions,
  ReceiveMessageCall,
  ReceiptInput,
  ReceiptStage,
  ReceiptView,
} from "./recovery/index.js";

export {
  createMemoryInflightStore,
  createStorageInflightStore,
} from "./inflight/index.js";
export type {
  InflightRecord,
  InflightStep,
  InflightStorage,
  InflightStore,
} from "./inflight/index.js";
