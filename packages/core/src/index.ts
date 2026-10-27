/**
 * Framework-agnostic engine, types, errors and helpers for Whisk. Most apps
 * use `@usewhisk/react`; use this package for a non-React frontend or for
 * engine logic on a server.
 */

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
  StellarTrustline,
  QuoteParams,
  SendParams,
  SendListeners,
  SendStepListener,
  SendResult,
  SendSuccess,
  SendFailure,
  CustomFeeOutcome,
  MaxSendable,
  ResumeFromTxParams,
  ResumeOptions,
  RefundParams,
  RefundResult,
} from "./engine/types.js";

/** Convert between decimal USDC strings and 6-decimal bigint subunits. */
export {
  USDC_DECIMALS,
  formatUsdcAmount,
  parseUsdcAmount,
} from "./engine/amount.js";

export {
  REFUND_OF_TX_KEY,
  REFUND_REASON_KEY,
  buildRefundMetadata,
  validateRefundInput,
} from "./refund/index.js";
export type { RefundInput, RefundPlan } from "./refund/index.js";

// Server-side only: never put the webhook secret in client code.
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
export { getStarknetTransactionStatus } from "@usewhisk/cctp";
export type { StarknetTransactionStatus } from "@usewhisk/cctp";
export {
  connectedEcosystems,
  decideRoute,
  planRoute,
} from "./routing/index.js";
export type { PlanRouteInput, RouteMint, RoutePlan } from "./routing/index.js";

export { addressResolver, composeResolvers } from "./resolvers/index.js";

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

export { reduce, initialState, initialSteps } from "./state/index.js";
export type { WhiskAction } from "./state/index.js";

export {
  METADATA_MAX_BYTES,
  METADATA_RESERVED_PREFIX,
  mergeMetadata,
  validateMetadata,
} from "./metadata/index.js";
export type { WhiskMetadata } from "./metadata/index.js";

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
