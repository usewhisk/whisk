/**
 * Stellar `CctpForwarder.mint_and_forward` invocation builder.
 *
 * Single Soroban call on the Stellar destination side:
 *
 *   mint_and_forward(message: Bytes, attestation: Bytes)
 *
 * Internally the Forwarder:
 *   1. Validates the message
 *   2. Extracts `forward_recipient` from hookData
 *   3. Calls `receive_message` on MessageTransmitter (mints USDC to the
 *      Forwarder contract itself)
 *   4. Transfers minted USDC to `forward_recipient`
 *   5. Atomic — any failure reverts the entire invocation
 */
import { Contract, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import type { StellarCctpChain } from "../chains/types.js";
import { InvalidInputError } from "../errors.js";
import type { StellarInvocation } from "./burn.js";

export type BuildStellarMintIntentInput = {
  destination: StellarCctpChain;
  /** Raw CCTP message bytes from Iris. */
  message: Uint8Array;
  /** Raw attestation bytes from Iris. */
  attestation: Uint8Array;
};

export type StellarMintIntent = {
  destination: StellarCctpChain;
  invocation: StellarInvocation;
};

export function buildStellarMintIntent(
  input: BuildStellarMintIntentInput,
): StellarMintIntent {
  if (input.destination.ecosystem !== "stellar") {
    throw new InvalidInputError(
      "invalid_chain",
      `destination must be a Stellar chain, got ${input.destination.ecosystem}`,
    );
  }
  if (input.message.length < 44) {
    throw new InvalidInputError(
      "invalid_input",
      `message must be at least 44 bytes, got ${input.message.length}`,
    );
  }
  if (input.attestation.length === 0) {
    throw new InvalidInputError(
      "invalid_input",
      "attestation must not be empty",
    );
  }

  const args: xdr.ScVal[] = [
    nativeToScVal(Buffer.from(input.message), { type: "bytes" }),
    nativeToScVal(Buffer.from(input.attestation), { type: "bytes" }),
  ];

  const operation = new Contract(input.destination.cctpForwarder).call(
    "mint_and_forward",
    ...args,
  );

  return {
    destination: input.destination,
    invocation: {
      ecosystem: "stellar",
      contractId: input.destination.cctpForwarder,
      functionName: "mint_and_forward",
      args,
      operation,
    },
  };
}
