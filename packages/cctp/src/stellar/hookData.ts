/**
 * For any CCTP burn whose destination is Stellar, BOTH `mintRecipient`
 * and `destinationCaller` MUST be the `CctpForwarder` contract address.
 * The actual recipient (G/M/C strkey) goes inside `hookData` in the
 * format below; the Forwarder extracts it and forwards the minted USDC
 * atomically.
 *
 * If `mintRecipient` is a user account or muxed address instead, the
 * USDC never reaches the Forwarder and is stuck for good.
 *
 * Layout (per Circle's Stellar CCTP spec):
 *
 *   bytes  0..23  reserved (zero-filled magic, Circle uses for versioning)
 *   bytes 24..27  hook data version (u32 BE, `0`)
 *   bytes 28..31  forwardRecipient length L (u32 BE)
 *   bytes 32..    forwardRecipient encoded as UTF-8 of the strkey
 *   bytes 32+L..  optional integrator payload (omit if unused)
 */
import { isValidStellarStrkey } from "./strkey.js";
import { InvalidInputError } from "../errors.js";

const RESERVED_MAGIC_LENGTH = 24;
const VERSION_OFFSET = 24;
const LENGTH_OFFSET = 28;
const PAYLOAD_OFFSET = 32;
const HOOK_DATA_VERSION = 0;

/**
 * @param forwardRecipientStrkey - Stellar strkey of the final recipient
 *   (G…, C…, or M… address). The Forwarder will atomically transfer
 *   minted USDC to this address after the on-chain mint.
 * @param integratorPayload - Optional extra bytes appended after the
 *   strkey. Whisk doesn't use it.
 * @returns 0x-prefixed hex string ready for the EVM/Solana burn call.
 */
export function buildStellarForwarderHookData(
  forwardRecipientStrkey: string,
  integratorPayload?: Uint8Array,
): `0x${string}` {
  if (!isValidStellarStrkey(forwardRecipientStrkey)) {
    throw new InvalidInputError(
      "invalid_address",
      `Stellar forwardRecipient must be a G/M/C strkey, got: ${forwardRecipientStrkey}`,
    );
  }

  const recipientBytes = new TextEncoder().encode(forwardRecipientStrkey);
  const payloadLength = integratorPayload?.length ?? 0;
  const total = PAYLOAD_OFFSET + recipientBytes.length + payloadLength;
  const buf = new Uint8Array(total);

  // The reserved bytes are left as the zeros Uint8Array starts with.
  void RESERVED_MAGIC_LENGTH;

  writeU32BE(buf, VERSION_OFFSET, HOOK_DATA_VERSION);

  writeU32BE(buf, LENGTH_OFFSET, recipientBytes.length);

  buf.set(recipientBytes, PAYLOAD_OFFSET);

  if (integratorPayload && integratorPayload.length > 0) {
    buf.set(integratorPayload, PAYLOAD_OFFSET + recipientBytes.length);
  }

  let hex = "0x";
  for (const b of buf) hex += b.toString(16).padStart(2, "0");
  return hex as `0x${string}`;
}

function writeU32BE(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}
