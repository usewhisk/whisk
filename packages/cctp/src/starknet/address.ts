/**
 * Starknet address / mintRecipient helpers.
 *
 * Starknet uses 252-bit field elements, but CCTP messages carry 32-byte
 * `mintRecipient` / `destinationCaller` fields. Whisk normalizes to two
 * forms:
 *
 *   - bytes32 hex (`0x` + 64 hex) — what other ecosystems pack into the
 *     CCTP message envelope.
 *   - u256 bigint — what Starknet's `deposit_for_burn` expects in
 *     calldata.
 *
 * Conversion is just zero-extending the felt to 32 bytes or reading the
 * bigint back from it.
 */
import type { StarknetFelt } from "../chains/types.js";
import { InvalidInputError } from "../errors.js";

const STARKNET_FELT_RE = /^0x[a-fA-F0-9]{1,64}$/;

export function isValidStarknetFelt(s: string): boolean {
  return STARKNET_FELT_RE.test(s);
}

/** Validate + return the felt. Throws on malformed input. */
export function assertStarknetFelt(s: string): StarknetFelt {
  if (!isValidStarknetFelt(s)) {
    throw new InvalidInputError(
      "invalid_address",
      `Not a valid Starknet felt: ${s}`,
    );
  }
  return s as StarknetFelt;
}

/**
 * Encode a Starknet felt (any length up to 252 bits) as a 0x-prefixed
 * 32-byte hex string. Used for `mintRecipient` when bridging TO Starknet
 * from another ecosystem.
 */
export function feltToBytes32Hex(felt: StarknetFelt): `0x${string}` {
  if (!isValidStarknetFelt(felt)) {
    throw new InvalidInputError(
      "invalid_address",
      `Not a valid Starknet felt: ${felt}`,
    );
  }
  const stripped = felt.slice(2);
  if (stripped.length > 64) {
    throw new InvalidInputError(
      "invalid_address",
      `Starknet felt exceeds 32 bytes: ${felt}`,
    );
  }
  return `0x${stripped.padStart(64, "0")}` as `0x${string}`;
}

/** Decode the 32-byte payload to a `StarknetFelt` (with leading zeros stripped). */
export function bytes32HexToFelt(hex: `0x${string}` | string): StarknetFelt {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (stripped.length > 64) {
    throw new InvalidInputError(
      "invalid_address",
      `bytes32 input exceeds 32 bytes (${stripped.length / 2})`,
    );
  }
  // Preserve canonical 0x-prefixed form; strip leading zeros for compactness.
  const stripped64 = stripped.padStart(64, "0").replace(/^0+/, "");
  const canonical = stripped64.length === 0 ? "0" : stripped64;
  return `0x${canonical}` as StarknetFelt;
}

/** Bigint helper — useful when packing into u256 calldata args. */
export function feltToBigInt(felt: StarknetFelt): bigint {
  if (!isValidStarknetFelt(felt)) {
    throw new InvalidInputError(
      "invalid_address",
      `Not a valid Starknet felt: ${felt}`,
    );
  }
  return BigInt(felt);
}
