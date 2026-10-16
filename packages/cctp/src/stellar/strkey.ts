/**
 * Stellar strkey helpers.
 *
 * Stellar addresses are Base32 "strkeys" with a single-character type
 * marker: `G` = Ed25519 account, `M` = muxed account, `C` = Soroban
 * contract. CCTP messages strip the type marker and carry only the
 * 32-byte payload, so `mintRecipient` is always assumed to be a
 * contract — Whisk routes Stellar mints through `CctpForwarder` to
 * handle every account type.
 */
import { StrKey } from "@stellar/stellar-sdk";
import { InvalidInputError } from "../errors.js";

export type StellarStrkeyType = "G" | "M" | "C";

export function isValidStellarStrkey(s: string): boolean {
  return (
    StrKey.isValidEd25519PublicKey(s) ||
    StrKey.isValidMed25519PublicKey(s) ||
    StrKey.isValidContract(s)
  );
}

/** Returns the strkey type marker (`G`, `M`, or `C`). Throws if invalid. */
export function strkeyType(s: string): StellarStrkeyType {
  if (StrKey.isValidEd25519PublicKey(s)) return "G";
  if (StrKey.isValidMed25519PublicKey(s)) return "M";
  if (StrKey.isValidContract(s)) return "C";
  throw new InvalidInputError(
    "invalid_address",
    `Invalid Stellar strkey: ${s}`,
  );
}

/**
 * Decode a strkey to its raw 32-byte payload. Used to encode Stellar
 * addresses inside CCTP messages — `mintRecipient` is always a contract
 * (C) when bridging into Stellar.
 */
export function decodeStrkeyToBytes32(s: string): Uint8Array {
  if (StrKey.isValidEd25519PublicKey(s))
    return StrKey.decodeEd25519PublicKey(s);
  if (StrKey.isValidContract(s)) return StrKey.decodeContract(s);
  if (StrKey.isValidMed25519PublicKey(s)) {
    // Muxed accounts embed a 64-bit id; for CCTP we want only the
    // 32-byte Ed25519 payload. Take the first 32 bytes of the underlying.
    return StrKey.decodeMed25519PublicKey(s).slice(0, 32);
  }
  throw new InvalidInputError(
    "invalid_address",
    `Invalid Stellar strkey: ${s}`,
  );
}

/** Encode a 32-byte payload as a contract strkey (C…). */
export function encodeContractStrkey(bytes: Uint8Array): string {
  if (bytes.length !== 32) {
    throw new InvalidInputError(
      "invalid_input",
      `encodeContractStrkey: bytes must be 32, got ${bytes.length}`,
    );
  }
  return StrKey.encodeContract(Buffer.from(bytes));
}

/**
 * Convert a Stellar contract strkey (C…) to its 0x-prefixed bytes32
 * hex form. Used when an EVM `depositForBurn` needs to encode a
 * Stellar contract as `mintRecipient` / `destinationCaller`.
 */
export function contractStrkeyToBytes32Hex(s: string): `0x${string}` {
  if (!StrKey.isValidContract(s)) {
    throw new InvalidInputError(
      "invalid_address",
      `Not a Stellar contract strkey (C…): ${s}`,
    );
  }
  const bytes = StrKey.decodeContract(s);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex as `0x${string}`;
}
