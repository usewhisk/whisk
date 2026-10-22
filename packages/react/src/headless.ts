/**
 * `@usewhisk/react/headless`: the provider, hooks, config builders and core
 * exports, without the visual components or their CSS.
 */

export { WhiskProvider } from "./provider/WhiskProvider.js";
export type { WhiskProviderProps } from "./provider/WhiskProvider.js";

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

export type {
  CallReceipt,
  EvmAdapter,
  EvmCall,
  QuoteParams,
  RefundParams,
  RefundResult,
  MaxSendable,
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

export {
  buildRefundMetadata,
  REFUND_OF_TX_KEY,
  REFUND_REASON_KEY,
  validateRefundInput,
} from "@usewhisk/core";
export type { RefundInput, RefundPlan } from "@usewhisk/core";

export {
  METADATA_MAX_BYTES,
  METADATA_RESERVED_PREFIX,
  mergeMetadata,
  validateMetadata,
} from "@usewhisk/core";
export type { WhiskMetadata } from "@usewhisk/core";

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
  QuoteChangedError,
  QuoteExpiredError,
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

// The treasury address is exported so its share of a custom fee can be
// audited.
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

export {
  formatUsdcAmount,
  parseUsdcAmount,
  USDC_DECIMALS,
} from "@usewhisk/core";
