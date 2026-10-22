/**
 * In the happy path Circle's Orbit forwarder calls `receiveMessage` on
 * the destination chain. This builder is for the recovery path: when
 * `forwardState` is `FAILED` (or the user opts out of the forwarder),
 * the engine needs the destination-chain calldata so a wallet adapter
 * can submit the mint manually.
 */
import { encodeFunctionData } from "viem";
import type { CctpChain } from "../chains/types.js";
import { messageTransmitterV2Abi } from "../abi/messageTransmitterV2.js";
import { InvalidInputError, UnsupportedError } from "../errors.js";
import type { EvmCall } from "../burn/types.js";

export type MintIntent = {
  destination: CctpChain;
  call: EvmCall;
};

export type BuildMintIntentInput = {
  destination: CctpChain;
  /** Raw 0x-prefixed CCTP message bytes from Iris. */
  message: `0x${string}`;
  /** Raw 0x-prefixed attestation bytes from Iris. */
  attestation: `0x${string}`;
};

const HEX_PREFIX_REGEX = /^0x[0-9a-fA-F]+$/;

/**
 * `receiveMessage` on the destination's `MessageTransmitterV2`. EVM
 * destinations only. Whoever submits the call pays destination gas.
 */
export function buildMintIntent(input: BuildMintIntentInput): MintIntent {
  if (input.destination.ecosystem !== "evm") {
    throw new UnsupportedError(
      "unsupported_ecosystem",
      `Destination chain "${input.destination.id}" is not EVM. v1 supports EVM only.`,
    );
  }
  if (!HEX_PREFIX_REGEX.test(input.message)) {
    throw new InvalidInputError(
      "invalid_input",
      "message must be a 0x-prefixed hex string",
    );
  }
  if (!HEX_PREFIX_REGEX.test(input.attestation)) {
    throw new InvalidInputError(
      "invalid_input",
      "attestation must be a 0x-prefixed hex string",
    );
  }

  const data = encodeFunctionData({
    abi: messageTransmitterV2Abi,
    functionName: "receiveMessage",
    args: [input.message, input.attestation],
  });

  return {
    destination: input.destination,
    call: {
      to: input.destination.messageTransmitter,
      data,
      value: 0n,
    },
  };
}
