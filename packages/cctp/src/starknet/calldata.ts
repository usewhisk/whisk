/**
 * Starknet calldata serialization helpers.
 *
 * Starknet's `Call` envelope is `{ contractAddress, entrypoint, calldata }`
 * where `calldata` is a flat array of felt252 strings. Cairo types serialize
 * as follows:
 *
 *   u256              → 2 felts (low, high)
 *   u32 / ContractAddress / felt252 → 1 felt
 *   ByteArray         → variable felts (pending word + data array + len)
 *
 * Whisk uses these helpers to encode CCTP V2 burn / receive calls without
 * pulling starknet.js's full ABI compiler in callers.
 */
import { cairo, num } from "starknet";

/** Encode a u256 as `[lo, hi]` felt strings (decimal). */
export function u256ToFelts(value: bigint): [string, string] {
  if (value < 0n) {
    throw new RangeError(
      `u256ToFelts: value must be non-negative, got ${value}`,
    );
  }
  const u = cairo.uint256(value);
  return [u.low.toString(), u.high.toString()];
}

/** Encode a u32 / u64 / felt252 as a single felt string (decimal). */
export function feltToString(value: number | bigint | string): string {
  return num.toBigInt(value).toString();
}

/**
 * Encode a `ByteArray` from raw bytes.
 *
 * Cairo `ByteArray` calldata serialization:
 *
 *   [ data.length: u32,
 *     ...data: felt252 (31 bytes each, big-endian),
 *     pending_word: felt252 (< 31 bytes, big-endian),
 *     pending_word_len: u32 ]
 *
 * Each 31-byte block becomes ONE felt whose value is the big-endian
 * integer of those bytes. The trailing (bytes.length % 31) bytes go
 * into `pending_word` — again as a big-endian integer of exactly that
 * many bytes.
 *
 * DO NOT use starknet.js's `byteArray.byteArrayFromString` for this —
 * it treats the input as a UTF-8 string, which mangles raw bytes like
 * CCTP attestation blobs.
 */
export function bytesToByteArrayFelts(bytes: Uint8Array): string[] {
  const CHUNK = 31;
  const dataFelts: string[] = [];
  let i = 0;
  while (i + CHUNK <= bytes.length) {
    dataFelts.push(bytesToBigIntBE(bytes.subarray(i, i + CHUNK)).toString());
    i += CHUNK;
  }
  const rest = bytes.subarray(i);
  const pendingWord = bytesToBigIntBE(rest).toString();
  const pendingWordLen = rest.length.toString();
  return [
    dataFelts.length.toString(),
    ...dataFelts,
    pendingWord,
    pendingWordLen,
  ];
}

function bytesToBigIntBE(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

/** Encode a 0x-prefixed hex blob (any length) as a Cairo ByteArray. */
export function hexToByteArrayFelts(hex: string): string[] {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return bytesToByteArrayFelts(bytes);
}
