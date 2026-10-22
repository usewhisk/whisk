/**
 * Forwarder hookData.
 *
 * Including this 32-byte hookData in `depositForBurnWithHook` tells
 * Circle's Orbit relayer to fetch the attestation and submit the
 * destination mint on the user's behalf.
 *
 * Layout:
 *   bytes  0..11: ASCII "cctp-forward"
 *   bytes 12..23: zero pad
 *   bytes 24..27: uint32 BE version (0)
 *   bytes 28..31: uint32 BE payload length (0 for basic forwarding)
 */

/** Static hex string used for every Whisk bridge with forwarder enabled. */
export const CCTP_FORWARD_HOOK_DATA =
  "0x636374702d666f72776172640000000000000000000000000000000000000000" as `0x${string}`;

export const CCTP_FORWARD_HOOK_DATA_LENGTH = 32;

const MAGIC_PREFIX = "cctp-forward";
const VERSION = 0;
const PAYLOAD_LENGTH = 0;

/**
 * Encodes the same bytes as `CCTP_FORWARD_HOOK_DATA` field by field. Stellar
 * destinations need a payload and use `buildStellarForwarderHookData`.
 */
export function buildForwarderHookData(): `0x${string}` {
  const buf = new Uint8Array(CCTP_FORWARD_HOOK_DATA_LENGTH);
  const encoder = new TextEncoder();
  buf.set(encoder.encode(MAGIC_PREFIX), 0);
  const view = new DataView(buf.buffer);
  view.setUint32(24, VERSION, false);
  view.setUint32(28, PAYLOAD_LENGTH, false);
  return bytesToHex(buf);
}

/** True when `hex` starts with the 32-byte basic forwarder hookData. */
export function isForwarderHookData(hex: string): boolean {
  if (!hex.startsWith("0x")) return false;
  return hex
    .toLowerCase()
    .startsWith(
      "0x636374702d666f72776172640000000000000000000000000000000000000000",
    );
}

/** bytes32(0) as `destinationCaller` lets anyone submit the mint. */
export const ANY_DESTINATION_CALLER =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let out = "0x";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    out += byte.toString(16).padStart(2, "0");
  }
  return out as `0x${string}`;
}
