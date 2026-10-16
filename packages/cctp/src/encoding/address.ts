/**
 * Address encoding for CCTP message fields.
 *
 * CCTP uses 32-byte (`bytes32`) values for `mintRecipient` and
 * `destinationCaller` so it can carry both 20-byte EVM addresses and
 * 32-byte non-EVM addresses.
 *
 * v1: EVM only. Future ecosystems (Solana, Starknet, Stellar) will
 * add their own encoders here.
 */

import type { Address } from "../chains/types.js";
import { InvalidInputError } from "../errors.js";

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export class InvalidAddressError extends InvalidInputError {
  constructor(input: string) {
    super("invalid_address", `Invalid EVM address: ${input}`);
    this.name = "InvalidAddressError";
  }
}

export class InvalidBytes32Error extends InvalidInputError {
  constructor(input: string) {
    super("invalid_bytes32", `Invalid bytes32 value: ${input}`);
    this.name = "InvalidBytes32Error";
  }
}

/**
 * Left-pad a 20-byte EVM address to 32 bytes for use as a CCTP
 * `bytes32` field.
 *
 *   0xabcd...1234  →  0x000000000000000000000000abcd...1234
 *
 * Output is lowercase. Input checksumming is preserved if you call
 * `getAddress(fromBytes32(value))` later.
 */
export function toBytes32(address: Address | string): `0x${string}` {
  if (!ADDRESS_REGEX.test(address)) {
    throw new InvalidAddressError(address);
  }
  const hex = address.slice(2).toLowerCase();
  return `0x${"00".repeat(12)}${hex}` as `0x${string}`;
}

/**
 * Reverse of `toBytes32`. Strips the 12-byte zero pad and returns a
 * lowercase 20-byte address.
 *
 * Throws if the upper 12 bytes are not zero (i.e. the value isn't an
 * EVM address). Callers can use `tryFromBytes32` for a non-throwing
 * variant.
 */
export function fromBytes32(value: `0x${string}` | string): Address {
  const cleaned = value.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(cleaned)) {
    throw new InvalidBytes32Error(value);
  }
  const upper = cleaned.slice(2, 2 + 24);
  if (upper !== "00".repeat(12)) {
    throw new InvalidBytes32Error(
      `non-zero upper 12 bytes (not an EVM address): ${value}`,
    );
  }
  return `0x${cleaned.slice(26)}` as Address;
}

export function tryFromBytes32(value: string): Address | undefined {
  try {
    return fromBytes32(value);
  } catch {
    return undefined;
  }
}

/**
 * Validate that a string is a 20-byte hex EVM address.
 */
export function isAddress(value: string): value is Address {
  return ADDRESS_REGEX.test(value);
}
