/**
 * Starknet CCTP V2 protocol layer.
 *
 * Cairo Call builders, felt/u256/ByteArray serialization, address
 * helpers. The actual transaction assembly (account, signature,
 * resource bounds) is the StarknetAdapter's job in @usewhisk/core.
 */
export {
  isValidStarknetFelt,
  assertStarknetFelt,
  feltToBytes32Hex,
  bytes32HexToFelt,
  feltToBigInt,
} from "./address.js";

export {
  u256ToFelts,
  feltToString,
  bytesToByteArrayFelts,
  hexToByteArrayFelts,
} from "./calldata.js";

export { buildStarknetApproveCall, buildStarknetBurnIntent } from "./burn.js";
export type {
  BuildStarknetBurnIntentInput,
  StarknetBurnIntent,
  StarknetCall,
} from "./burn.js";

export { buildStarknetReceiveIntent } from "./receive.js";
export type {
  BuildStarknetReceiveIntentInput,
  StarknetReceiveIntent,
} from "./receive.js";
