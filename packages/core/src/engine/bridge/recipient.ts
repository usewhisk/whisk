/**
 * CCTP messages carry a 32-byte `mintRecipient`. An EVM address is
 * left-padded with 12 zero bytes; a Solana pubkey is used as is.
 */
import { PublicKey } from "@solana/web3.js";
import { toBytes32 } from "@usewhisk/cctp";
import type { CctpChain } from "@usewhisk/cctp";
import { InvalidAddressError } from "../../errors/errors.js";

/** Returns `0x`-prefixed hex of exactly 32 bytes. */
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
  return toBytes32(recipientAddress);
}

/** Throws `InvalidAddressError` if not a valid pubkey. */
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
