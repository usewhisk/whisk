/**
 * Minimal Borsh encoders for CCTP V2's Solana program params.
 *
 * The handful of primitives we need (u32/u64 little-endian, fixed-32-byte
 * pubkey, length-prefixed `Vec<u8>`) are small enough to hand-roll
 * without a Borsh runtime.
 */
import { Buffer } from "node:buffer";

export type BorshWriter = {
  buf: Buffer;
  offset: number;
};

export function createWriter(initialSize = 64): BorshWriter {
  return { buf: Buffer.alloc(initialSize), offset: 0 };
}

function ensure(w: BorshWriter, extra: number): void {
  if (w.offset + extra <= w.buf.length) return;
  const next = Buffer.alloc(Math.max(w.buf.length * 2, w.offset + extra));
  w.buf.copy(next, 0, 0, w.offset);
  w.buf = next;
}

export function writeU8(w: BorshWriter, value: number): void {
  ensure(w, 1);
  w.buf.writeUInt8(value, w.offset);
  w.offset += 1;
}

export function writeU32LE(w: BorshWriter, value: number): void {
  ensure(w, 4);
  w.buf.writeUInt32LE(value >>> 0, w.offset);
  w.offset += 4;
}

export function writeU64LE(w: BorshWriter, value: bigint): void {
  if (value < 0n) {
    throw new RangeError(
      `writeU64LE: value must be non-negative, got ${value}`,
    );
  }
  ensure(w, 8);
  w.buf.writeBigUInt64LE(value, w.offset);
  w.offset += 8;
}

/** Write a fixed 32-byte pubkey or hash. */
export function writePubkey(w: BorshWriter, bytes: Uint8Array): void {
  if (bytes.length !== 32) {
    throw new RangeError(`writePubkey: expected 32 bytes, got ${bytes.length}`);
  }
  ensure(w, 32);
  w.buf.set(bytes, w.offset);
  w.offset += 32;
}

/** `Vec<u8>`: 4-byte LE length prefix, then the raw bytes. */
export function writeBytes(w: BorshWriter, bytes: Uint8Array): void {
  writeU32LE(w, bytes.length);
  ensure(w, bytes.length);
  w.buf.set(bytes, w.offset);
  w.offset += bytes.length;
}

/** Concatenate a discriminator and the writer's buffer. */
export function withDiscriminator(
  discriminator: Uint8Array,
  w: BorshWriter,
): Buffer {
  const out = Buffer.alloc(discriminator.length + w.offset);
  out.set(discriminator, 0);
  w.buf.copy(out, discriminator.length, 0, w.offset);
  return out;
}

/** Finalize a writer to a `Buffer` of exactly `offset` bytes. */
export function finalize(w: BorshWriter): Buffer {
  return Buffer.from(w.buf.buffer, w.buf.byteOffset, w.offset);
}
