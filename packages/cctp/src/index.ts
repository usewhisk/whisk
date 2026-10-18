/**
 * CCTP V2 protocol layer.
 *
 * Owns the direct integration with CCTP V2 contracts and Circle's Iris
 * attestation API. Pure protocol builders and HTTP client; no wallet
 * state, no transaction submission.
 *
 * v1 is EVM-only. Non-EVM ecosystems are on the roadmap.
 */

export const VERSION = "0.1.0";

// Error hierarchy
export {
  CctpError,
  InvalidInputError,
  IrisAbortedError,
  IrisError,
  IrisHttpError,
  IrisNetworkError,
  IrisParseError,
  ProtocolError,
  UnsupportedError,
  isCctpError,
} from "./errors.js";
export type { CctpErrorCode } from "./errors.js";

export * from "./chains/index.js";

// ABIs
export {
  tokenMessengerV2Abi,
  messageTransmitterV2Abi,
  usdcAbi,
} from "./abi/index.js";

// Iris API
export {
  IRIS_MAINNET_URL,
  IRIS_SANDBOX_URL,
  irisBaseUrl,
  FINALITY_FAST,
  fetchIrisJson,
  getBurnFees,
  pickFeeTier,
  pickForwarderFee,
  getMessages,
  pollMessages,
  reattest,
} from "./iris/index.js";
export type {
  BurnFeeTier,
  FetchJsonOptions,
  FinalityThreshold,
  ForwarderFeeTier,
  ForwardState,
  GetBurnFeesOptions,
  GetMessagesOptions,
  GetMessagesQuery,
  IrisAttestationStatus,
  IrisMessage,
  IrisMessagesResponse,
  PollMessageOptions,
  ReattestOptions,
} from "./iris/index.js";

// Forwarder
export {
  ANY_DESTINATION_CALLER,
  CCTP_FORWARD_HOOK_DATA,
  CCTP_FORWARD_HOOK_DATA_LENGTH,
  buildForwarderHookData,
  isForwarderHookData,
} from "./forwarder/index.js";

// Address encoding
export {
  InvalidAddressError,
  InvalidBytes32Error,
  fromBytes32,
  isAddress,
  toBytes32,
  tryFromBytes32,
} from "./encoding/index.js";

// Fee math
export {
  computeBurnFee,
  computeMaxFee,
  parseFeeBps,
  parseForwarderFee,
  selectForwarderFee,
} from "./fees/index.js";
export type { ComputeMaxFeeInput, ComputeMaxFeeResult } from "./fees/index.js";

// Burn intent builder
export { buildBurnIntent } from "./burn/index.js";
export type {
  BuildBurnIntentInput,
  BurnIntent,
  EvmCall,
} from "./burn/index.js";

// Manual mint builder (recovery path)
export { buildMintIntent } from "./mint/index.js";
export type { BuildMintIntentInput, MintIntent } from "./mint/index.js";

// Starknet — protocol layer
export {
  buildStarknetApproveCall,
  buildStarknetBurnIntent,
  buildStarknetReceiveIntent,
  assertStarknetFelt,
  isValidStarknetFelt,
  feltToBytes32Hex,
  bytes32HexToFelt,
  feltToBigInt,
  u256ToFelts,
  feltToString as starknetFeltToString,
  bytesToByteArrayFelts,
  hexToByteArrayFelts,
} from "./starknet/index.js";
export type {
  BuildStarknetBurnIntentInput,
  BuildStarknetReceiveIntentInput,
  StarknetBurnIntent,
  StarknetCall,
  StarknetReceiveIntent,
} from "./starknet/index.js";

// Stellar — protocol layer
export {
  buildStellarApproveInvocation,
  buildStellarBurnIntent,
  buildStellarMintIntent,
  buildStellarForwarderHookData,
  canonicalToStellarSubunits,
  stellarSubunitsToCanonical,
  stellarBurnDust,
  isValidStellarStrkey,
  strkeyType,
  decodeStrkeyToBytes32,
  encodeContractStrkey,
  contractStrkeyToBytes32Hex,
  strkeyTo32Bytes,
} from "./stellar/index.js";
export type {
  BuildStellarBurnIntentInput,
  BuildStellarMintIntentInput,
  StellarBurnIntent,
  StellarMintIntent,
  StellarInvocation,
  StellarStrkeyType,
} from "./stellar/index.js";

// Solana — protocol layer
export {
  anchorDiscriminator,
  buildSolanaBurnIntent,
  buildSolanaReceiveIntent,
  burnIntentToTransactionInstruction,
  deriveCustodyTokenAccount,
  deriveDenylistAccount,
  deriveEventAuthority,
  deriveLocalToken,
  deriveMessageTransmitter,
  deriveMessageTransmitterAuthority,
  deriveRemoteTokenMessenger,
  deriveSenderAuthority,
  deriveTokenMessenger,
  deriveTokenMinter,
  deriveTokenPair,
  deriveUsedNonce,
  DISCRIMINATOR_DEPOSIT_FOR_BURN,
  DISCRIMINATOR_DEPOSIT_FOR_BURN_WITH_HOOK,
  DISCRIMINATOR_RECEIVE_MESSAGE,
  parseTokenMessengerFeeRecipient,
  receiveIntentToTransactionInstruction,
  SOLANA_ANY_DESTINATION_CALLER,
  SOLANA_CCTP_PDA_SEEDS,
} from "./solana/index.js";
export type {
  BuildSolanaBurnIntentInput,
  BuildSolanaReceiveIntentInput,
  SolanaBurnIntent,
  SolanaInstruction,
  SolanaReceiveIntent,
} from "./solana/index.js";
