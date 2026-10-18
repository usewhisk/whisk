/**
 * Mint-recipient encoding for cross-ecosystem bridges.
 *
 * CCTP messages carry a 32-byte `mintRecipient`. The encoding differs
 * by destination ecosystem:
 *
 *   EVM      20-byte address, left-padded with 12 zero bytes
 *   Solana   32-byte pubkey, used directly (no padding)
 */
import { PublicKey } from "@solana/web3.js";
import { toBytes32 } from "@usewhisk/cctp";
import type { CctpChain } from "@usewhisk/cctp";
import { InvalidAddressError } from "../../errors/errors.js";

/**
 * Encode the recipient as bytes32 for the destination ecosystem.
 *
 * Returns a `0x`-prefixed hex string of exactly 32 bytes — the form
 * EVM `depositForBurn` and Solana `deposit_for_burn` both expect.
 */
export function encodeMintRecipientBytes32(
  recipientAddress: string,
  destination: CctpChain,
): `0x${string}` {
  if (destination.ecosystem === "solana") {
    let pk: PublicKey;
    try {
      pk = new PublicKey(recipientAddress);
    } catch {
      throw new InvalidAddressError(recipientAddress);
    }
    return toHex(pk.toBytes());
  }
  // EVM — `toBytes32` handles the 20→32 byte left-pad with the right
  // validation; throws on a malformed hex address.
  return toBytes32(recipientAddress);
}

/** Solana pubkey → 32-byte `Uint8Array`. Throws if not a valid pubkey. */
export function solanaPubkeyToBytes32(address: string): Uint8Array {
  try {
    return new PublicKey(address).toBytes();
  } catch {
    throw new InvalidAddressError(address);
  }
}

function toHex(bytes: Uint8Array): `0x${string}` {
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s as `0x${string}`;
}
