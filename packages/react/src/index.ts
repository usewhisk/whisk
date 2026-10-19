/**
 * `@usewhisk/react` — embeddable USDC send + bridge widget.
 *
 * Drop-in components, headless hooks, and config builders. v1 is
 * EVM-only via wagmi; the `solana()` adapter factory is accepted today
 * for forward compatibility (Solana lands in v1.1 — see ROADMAP.md).
 */

/* --------------------------------------------------------------------- *
 *  Provider
 * --------------------------------------------------------------------- */

export { WhiskProvider } from "./provider/WhiskProvider.js";
export { createBrowserInflightStore } from "./lib/inflightStore.js";
export type { WhiskProviderProps } from "./provider/WhiskProvider.js";

/* --------------------------------------------------------------------- *
 *  Configuration
 *
 *  `createWhiskConfig` validates the input and freezes the result.
 *  `evm()` / `solana()` are factory functions for `config.wallets`.
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
 *  Widgets
 * --------------------------------------------------------------------- */

export { WhiskReceipt, WhiskSend } from "./components/index.js";
export type { WhiskReceiptProps, WhiskSendProps } from "./components/index.js";

/* --------------------------------------------------------------------- *
 *  UI primitives
 *
 *  Lower-level pieces for custom widget assembly. `PoweredByWhisk` is
 *  included so anyone composing the primitives by hand still ships the
 *  attribution badge.
 * --------------------------------------------------------------------- */

export {
  Banner,
  Button,
  Card,
  ChainPicker,
  ConnectModal,
  FieldBox,
  PoweredByWhisk,
  StepRail,
} from "./components/index.js";
export type {
  BannerProps,
  BannerVariant,
  ButtonProps,
  ButtonSize,
  ButtonVariant,
  ChainPickerProps,
  ConnectModalProps,
  FieldBoxProps,
  StepRailProps,
} from "./components/index.js";

/* --------------------------------------------------------------------- *
 *  Hooks
 * --------------------------------------------------------------------- */

export {
  createWagmiEvmAdapter,
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
 *  Theme
 * --------------------------------------------------------------------- */

export {
  getThemePreset,
  listThemeNames,
  resolveTheme,
  themePresets,
  themeToCssVars,
  tokensToCssVars,
} from "./theme/index.js";
export type {
  ResolvedTheme,
  WhiskColorMode,
  WhiskTheme,
  WhiskThemeInput,
  WhiskThemeName,
  WhiskThemeOverrides,
  WhiskThemeTokens,
} from "./theme/index.js";

/* --------------------------------------------------------------------- *
 *  Resolvers — `addressResolver` / `composeResolvers` come straight
 *  from `@usewhisk/core`; the ENS helpers live in this package.
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
 *  Engine — types only. Most consumers reach the engine through
 *  `useWhisk()`; types are re-exported here so custom widgets can name
 *  the same shapes without importing from `@usewhisk/core`.
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
 *  Errors — typed hierarchy + helpers for runtime branching.
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
 *  Types — Chain, Token, Route, Step, Quote, Fee* etc.
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
 *  Fees — merchant fee primitives. Useful when surfacing the 90/10
 *  split in a custom UI; `WHISK_TREASURY_ADDRESS` is exported so the
 *  10% destination is auditable.
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
 *  Chain registry helpers — same lookups the engine uses internally.
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
 *  Recovery — Iris polling, MessageTransmitter helpers, receipt view.
 *  Useful for advanced consumers building their own receipt surface.
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
