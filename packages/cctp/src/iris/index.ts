/**
 * Iris API client.
 */
export { IRIS_MAINNET_URL, IRIS_SANDBOX_URL, irisBaseUrl } from "./urls.js";

export { fetchIrisJson } from "./fetch.js";
export type { FetchJsonOptions } from "./fetch.js";

export { FINALITY_FAST, FINALITY_STANDARD } from "./types.js";
export type {
  BurnFeeTier,
  FinalityThreshold,
  TransferSpeed,
  ForwarderFeeTier,
  ForwardState,
  GetMessagesQuery,
  IrisAttestationStatus,
  IrisMessage,
  IrisMessagesResponse,
} from "./types.js";

export { getBurnFees, pickFeeTier, pickForwarderFee } from "./fees.js";
export type { GetBurnFeesOptions } from "./fees.js";

export { getMessages, pollMessages } from "./messages.js";
export type { GetMessagesOptions, PollMessageOptions } from "./messages.js";

export { reattest } from "./reattest.js";
export type { ReattestOptions } from "./reattest.js";
export { getFastBurnAllowance, getSignedBurnQuote } from "./quote.js";
export type {
  SignedBurnQuote,
  SignedBurnQuoteRequest,
  SignedQuoteExpiry,
  UpfrontFeeType,
} from "./quote.js";
