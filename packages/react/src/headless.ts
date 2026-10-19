/**
 * `@usewhisk/react/headless` — UI-free entry for advanced consumers.
 *
 * Exposes the provider, hooks, config builders, resolvers, and every
 * engine / type / utility export — minus the visual components and
 * their CSS. Useful for headless widgets, custom layouts,
 * server-rendered receipt pages, or non-DOM runtimes that just need
 * the wiring.
 *
 * For the full widget surface, import from `@usewhisk/react`.
 */

/* --------------------------------------------------------------------- *
 *  Provider
 * --------------------------------------------------------------------- */

export { WhiskProvider } from "./provider/WhiskProvider.js";
export type { WhiskProviderProps } from "./provider/WhiskProvider.js";

/* --------------------------------------------------------------------- *
 *  Configuration
 * --------------------------------------------------------------------- */

export { createWhiskConfig } from "./config/index.js";
export { evm } from "./config/adapters/evm.js";
export { solana } from "./config/adapters/solana.js";
export { stellar } from "./config/adapters/stellar.js";
export { starknet } from "./config/adapters/starknet.js";
export type {
  CreateWhiskConfigOptions,
  EvmAdapterFactory,
  EvmFactoryOptions,
  SolanaAdapterFactory,
  SolanaConfig,
  SolanaFactoryOptions,
  SolanaNetwork,
  StarknetAdapterFactory,
  StarknetConfig,
  StarknetFactoryOptions,
  StarknetNetwork,
  StellarAdapterFactory,
  StellarConfig,
  StellarFactoryOptions,
  StellarNetwork,
  WalletAdapterFactory,
  WhiskClientConfig,
} from "./config/index.js";

/* --------------------------------------------------------------------- *
 *  Hooks
 * --------------------------------------------------------------------- */

export {
  createWagmiEvmAdapter,
  useAdapterFor,
  useEvmAdapter,
  useReceipt,
  useRefund,
  useSolanaAdapter,
  useStarknetAdapter,
  useStellarAdapter,
  useWhisk,
  useWhiskContext,
  useWhiskEngine,
} from "./hooks/index.js";
export type {
  UseReceiptInput,
  UseReceiptResult,
  UseRefundResult,
  UseRefundVariables,
  UseWhiskResult,
} from "./hooks/index.js";

/* --------------------------------------------------------------------- *
 *  Resolvers
 * --------------------------------------------------------------------- */

export { addressResolver, composeResolvers } from "@usewhisk/core";
export {
  createDefaultResolver,
  createEnsResolver,
  DEFAULT_ENS_RPC_URLS,
  DEFAULT_ENS_SEPOLIA_RPC_URLS,
  defaultResolver,
  ensResolver,
  sepoliaEnsResolver,
} from "./resolvers/index.js";
export type {
  CreateDefaultResolverOptions,
  EnsResolverChain,
  EnsResolverOptions,
} from "./resolvers/index.js";

/* --------------------------------------------------------------------- *
 *  Engine types
 * --------------------------------------------------------------------- */

export type {
  CallReceipt,
  EvmAdapter,
  EvmCall,
  QuoteParams,
  RefundParams,
  RefundResult,
  ResumeFromTxParams,
  ResumeOptions,
  SendCallsOptions,
  SendCallsResult,
  SendFailure,
  SendListeners,
  SendParams,
  SendResult,
  SendStepListener,
  SendSuccess,
  WhiskAdapter,
  WhiskEngine,
} from "@usewhisk/core";

/* --------------------------------------------------------------------- *
 *  Refund correlation primitives
 * --------------------------------------------------------------------- */

export {
  buildRefundMetadata,
  REFUND_OF_TX_KEY,
  REFUND_REASON_KEY,
  validateRefundInput,
} from "@usewhisk/core";
export type { RefundInput, RefundPlan } from "@usewhisk/core";

/* --------------------------------------------------------------------- *
 *  Metadata correlation
 * --------------------------------------------------------------------- */

export {
  METADATA_MAX_BYTES,
  METADATA_RESERVED_PREFIX,
  mergeMetadata,
  validateMetadata,
} from "@usewhisk/core";
export type { WhiskMetadata } from "@usewhisk/core";

/* --------------------------------------------------------------------- *
 *  Errors
 * --------------------------------------------------------------------- */

export {
  BridgeStepError,
  cleanErrorMessage,
  ConfigError,
  InsufficientBalanceError,
  InvalidAddressError,
  NetworkError,
  NetworkMismatchError,
  NoAdapterError,
  OnchainRevertError,
  ResolverError,
  RouteUnavailableError,
  toWhiskError,
  UserRejectedError,
  WalletCapabilityError,
  WhiskError,
  WrongChainError,
} from "@usewhisk/core";
export type {
  RouteUnavailableReason,
  WhiskErrorCategory,
  WhiskErrorCode,
  WhiskErrorOptions,
} from "@usewhisk/core";

/* --------------------------------------------------------------------- *
 *  Types
 * --------------------------------------------------------------------- */

export type {
  Chain,
  ChainKind,
  ChainNetwork,
  FeeBearer,
  FeeBreakdown,
  FeeEntry,
  FeeEntryKind,
  FeePolicy,
  Quote,
  Resolver,
  ResolvedRecipient,
  Route,
  RouteMint,
  RoutePlan,
  Step,
  StepName,
  StepState,
  Token,
  WhiskConfig,
  WhiskState,
  WhiskStateKind,
} from "@usewhisk/core";
export {
  DEFAULT_FEE_BEARER,
  DEFAULT_TOKEN,
  isBridgeRoute,
  isSendRoute,
  planRoute,
} from "@usewhisk/core";

/* --------------------------------------------------------------------- *
 *  Fees
 * --------------------------------------------------------------------- */

export {
  BPS_DENOMINATOR,
  buildCustomFeeEntries,
  splitCustomFee,
  sumFees,
  sumForwarderFees,
  sumProtocolFees,
  WHISK_TREASURY_ADDRESS,
  WHISK_TREASURY_BPS,
} from "@usewhisk/core";
export type { CustomFeeSplit } from "@usewhisk/core";

/* --------------------------------------------------------------------- *
 *  Chain registry helpers
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
} from "@usewhisk/core";
export type { AddressFormat, CctpChain } from "@usewhisk/core";

/* --------------------------------------------------------------------- *
 *  Recovery
 * --------------------------------------------------------------------- */

export {
  buildReceiveMessageCall,
  deriveReceiptView,
  describeReceiptChains,
  EVM_MAINNET_MESSAGE_TRANSMITTER,
  EVM_TESTNET_MESSAGE_TRANSMITTER,
  fetchAttestationOnce,
  getIrisBaseUrl,
  IRIS_MAINNET_URL,
  IRIS_SANDBOX_URL,
  manualMintExplorerUrl,
  messageTransmitterAddress,
  pollAttestation,
  RECEIPT_STAGE_HELP,
  RECEIPT_STAGE_LABELS,
  RECEIVE_MESSAGE_ABI,
} from "@usewhisk/core";
export type {
  FetchAttestationOptions,
  IrisMessage,
  IrisStatus,
  PollAttestationOptions,
  ReceiptInput,
  ReceiptStage,
  ReceiptView,
  ReceiveMessageCall,
} from "@usewhisk/core";

/* --------------------------------------------------------------------- *
 *  Amount helpers
 * --------------------------------------------------------------------- */

export {
  formatUsdcAmount,
  parseUsdcAmount,
  USDC_DECIMALS,
} from "@usewhisk/core";
