/**
 * Starknet CCTP V2 `receive_message` Call builder.
 *
 * Cairo signature:
 *
 *   fn receive_message(message: ByteArray, attestation: ByteArray) -> bool
 *
 * Same two-byte-array shape as EVM's `receiveMessage`. The recipient
 * (or any third party) signs this on the destination side after Iris
 * attests the burn.
 */
import type { StarknetCctpChain } from "../chains/types.js";
import { InvalidInputError } from "../errors.js";
import { hexToByteArrayFelts } from "./calldata.js";
import type { StarknetCall } from "./burn.js";

export type BuildStarknetReceiveIntentInput = {
  destination: StarknetCctpChain;
  /** 0x-prefixed CCTP message bytes from Iris. */
  message: `0x${string}`;
  /** 0x-prefixed attestation bytes from Iris. */
  attestation: `0x${string}`;
};

export type StarknetReceiveIntent = {
  destination: StarknetCctpChain;
  call: StarknetCall;
};

export function buildStarknetReceiveIntent(
  input: BuildStarknetReceiveIntentInput,
): StarknetReceiveIntent {
  if (input.destination.ecosystem !== "starknet") {
    throw new InvalidInputError(
      "invalid_chain",
      `destination must be Starknet, got ${input.destination.ecosystem}`,
    );
  }
  if (!input.message.startsWith("0x") || input.message.length < 90) {
    throw new InvalidInputError(
      "invalid_input",
      "message must be a 0x-prefixed hex blob of at least 44 bytes",
    );
  }
  if (!input.attestation.startsWith("0x") || input.attestation.length < 4) {
    throw new InvalidInputError(
      "invalid_input",
      "attestation must be a 0x-prefixed hex blob",
    );
  }

  const calldata = [
    ...hexToByteArrayFelts(input.message),
    ...hexToByteArrayFelts(input.attestation),
  ];

  return {
    destination: input.destination,
    call: {
      contractAddress: input.destination.messageTransmitter,
      entrypoint: "receive_message",
      calldata,
    },
  };
}
