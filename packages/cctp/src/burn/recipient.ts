import { PublicKey } from "@solana/web3.js";
import type { Address, CctpChain } from "../chains/types.js";
import { isAddress, toBytes32 } from "../encoding/address.js";
import { InvalidInputError } from "../errors.js";

/** Validate `mintRecipient` for the destination and encode it as bytes32. */
export function encodeMintRecipient(
  destination: CctpChain,
  mintRecipient: Address | string,
): `0x${string}` {
  // mintRecipient validation depends on the destination ecosystem.
  //   EVM     → 20-byte 0x-prefixed hex
  //   Solana  → base58 32-byte pubkey
  //   Stellar → 0x-prefixed 32-byte hex (caller pre-encodes the
  //             CctpForwarder strkey via `contractStrkeyToBytes32Hex`)
  if (destination.ecosystem === "solana") {
    try {
      new PublicKey(mintRecipient);
    } catch {
      throw new InvalidInputError(
        "invalid_address",
        `mintRecipient is not a valid Solana pubkey: ${mintRecipient}`,
      );
    }
  } else if (destination.ecosystem === "stellar") {
    if (!/^0x[a-fA-F0-9]{64}$/.test(mintRecipient)) {
      throw new InvalidInputError(
        "invalid_address",
        `mintRecipient for Stellar must be 0x-prefixed 32-byte hex (the CctpForwarder strkey decoded); got: ${mintRecipient}`,
      );
    }
  } else if (destination.ecosystem === "starknet") {
    // Starknet felt zero-padded to 32 bytes.
    if (!/^0x[a-fA-F0-9]{64}$/.test(mintRecipient)) {
      throw new InvalidInputError(
        "invalid_address",
        `mintRecipient for Starknet must be 0x-prefixed 32-byte hex; got: ${mintRecipient}`,
      );
    }
  } else if (!isAddress(mintRecipient)) {
    throw new InvalidInputError(
      "invalid_address",
      `mintRecipient is not a valid EVM address: ${mintRecipient}`,
    );
  }
  if (destination.ecosystem === "solana") {
    const bytes = new PublicKey(mintRecipient).toBytes();
    let hex = "0x";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return hex as `0x${string}`;
  }
  if (
    destination.ecosystem === "stellar" ||
    destination.ecosystem === "starknet"
  ) {
    return mintRecipient as `0x${string}`;
  }
  return toBytes32(mintRecipient);
}
