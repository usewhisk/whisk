/**
 * Stellar CCTP V2 protocol layer.
 *
 * Soroban contract invocation builders, strkey helpers, Forwarder
 * hookData encoder, and 7↔6 decimal precision conversion. The actual
 * transaction assembly (XDR envelope, fees, signing) is handled by the
 * `StellarAdapter` in `@usewhisk/core`.
 */
export {
  isValidStellarStrkey,
  strkeyType,
  decodeStrkeyToBytes32,
  encodeContractStrkey,
  contractStrkeyToBytes32Hex,
} from "./strkey.js";
export type { StellarStrkeyType } from "./strkey.js";

export {
  stellarSubunitsToCanonical,
  canonicalToStellarSubunits,
  stellarBurnDust,
} from "./precision.js";

export { buildStellarForwarderHookData } from "./hookData.js";

export { buildStellarApproveInvocation } from "./approve.js";
export type { BuildStellarApproveInvocationInput } from "./approve.js";

export { buildStellarBurnIntent, strkeyTo32Bytes } from "./burn.js";
export type {
  BuildStellarBurnIntentInput,
  StellarBurnIntent,
  StellarInvocation,
} from "./burn.js";

export { buildStellarMintIntent } from "./mint.js";
export type { BuildStellarMintIntentInput, StellarMintIntent } from "./mint.js";
