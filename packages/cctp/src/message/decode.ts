import { InvalidInputError } from "../errors.js";

/** A CCTP V2 message carrying a burn, read from the attested bytes. */
export type DecodedBurnMessage = {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  nonce: `0x${string}`;
  sender: `0x${string}`;
  recipient: `0x${string}`;
  destinationCaller: `0x${string}`;
  minFinalityThreshold: number;
  finalityThresholdExecuted: number;
  body: {
    version: number;
    burnToken: `0x${string}`;
    mintRecipient: `0x${string}`;
    amount: bigint;
    messageSender: `0x${string}`;
    maxFee: bigint;
    feeExecuted: bigint;
    /** In the destination chain's own height; `0n` once finalized. */
    expirationBlock: bigint;
    hookData: `0x${string}`;
  };
};

const HEADER_BYTES = 148;
const BODY_BYTES = 228;

/**
 * Splits a message into its fields. Every address is the 32-byte form CCTP
 * carries; an EVM address is its last 20 bytes.
 */
export function decodeBurnMessage(message: `0x${string}`): DecodedBurnMessage {
  if (!/^0x([0-9a-fA-F]{2})*$/.test(message)) {
    throw new InvalidInputError("invalid_input", "message is not hex bytes");
  }
  const hex = message.slice(2).toLowerCase();
  if (hex.length < (HEADER_BYTES + BODY_BYTES) * 2) {
    throw new InvalidInputError(
      "invalid_input",
      `a burn message is at least ${HEADER_BYTES + BODY_BYTES} bytes, got ${hex.length / 2}`,
    );
  }
  let at = 0;
  const take = (bytes: number) => {
    const part = hex.slice(at, at + bytes * 2);
    at += bytes * 2;
    return part;
  };
  const uint = (bytes: number) => BigInt(`0x${take(bytes)}`);
  const word = (): `0x${string}` => `0x${take(32)}`;
  const small = (bytes: number) => Number.parseInt(take(bytes), 16);

  return {
    version: small(4),
    sourceDomain: small(4),
    destinationDomain: small(4),
    nonce: word(),
    sender: word(),
    recipient: word(),
    destinationCaller: word(),
    minFinalityThreshold: small(4),
    finalityThresholdExecuted: small(4),
    body: {
      version: small(4),
      burnToken: word(),
      mintRecipient: word(),
      amount: uint(32),
      messageSender: word(),
      maxFee: uint(32),
      feeExecuted: uint(32),
      expirationBlock: uint(32),
      hookData: `0x${hex.slice(at)}`,
    },
  };
}
