/**
 * When the Forwarder reports `FAILED`, or the forwarder is turned off, someone
 * has to call `receiveMessage` on the destination chain. These descriptors go
 * straight into viem's `writeContract` or wagmi's `useWriteContract`. For raw
 * calldata, such as an EIP-5792 batch, use `buildMintIntent` from
 * `@usewhisk/cctp`.
 */
import {
  getChain,
  MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  MESSAGE_TRANSMITTER_V2_SOLANA,
  messageTransmitterV2Abi,
} from "@usewhisk/cctp";
import type { Chain } from "../types/chain.js";
import { explorerTxUrl } from "../chains/index.js";

/** EVM `MessageTransmitterV2`, the same address on every EVM mainnet. */
export const EVM_MAINNET_MESSAGE_TRANSMITTER =
  MESSAGE_TRANSMITTER_V2_EVM_MAINNET;
/** EVM `MessageTransmitterV2`, the same address on every EVM testnet. */
export const EVM_TESTNET_MESSAGE_TRANSMITTER =
  MESSAGE_TRANSMITTER_V2_EVM_TESTNET;
/** Solana `MessageTransmitterV2` program, the same on mainnet-beta and devnet. */
export const SOLANA_MESSAGE_TRANSMITTER = MESSAGE_TRANSMITTER_V2_SOLANA;

export const RECEIVE_MESSAGE_ABI = messageTransmitterV2Abi.filter(
  (entry): entry is typeof entry & { name: "receiveMessage" } =>
    entry.type === "function" && entry.name === "receiveMessage",
);

export type ReceiveMessageCall = {
  destinationChain: Chain;
  address: string;
  abi: typeof RECEIVE_MESSAGE_ABI;
  functionName: "receiveMessage";
  args: [string, string];
};

export function messageTransmitterAddress(chain: Chain): string {
  return getChain(chain).messageTransmitter;
}

/**
 * Returns `null` for non-EVM destinations, which take a different call.
 * Throws a `TypeError` unless both inputs are 0x-prefixed hex.
 */
export function buildReceiveMessageCall(
  destinationChain: Chain,
  message: string,
  attestation: string,
): ReceiveMessageCall | null {
  if (!message || !message.startsWith("0x")) {
    throw new TypeError(
      "buildReceiveMessageCall: `message` must be a 0x-prefixed hex string",
    );
  }
  if (!attestation || !attestation.startsWith("0x")) {
    throw new TypeError(
      "buildReceiveMessageCall: `attestation` must be a 0x-prefixed hex string",
    );
  }
  const destination = getChain(destinationChain);
  if (destination.ecosystem !== "evm") return null;

  return {
    destinationChain,
    address: destination.messageTransmitter,
    abi: RECEIVE_MESSAGE_ABI,
    functionName: "receiveMessage",
    args: [message, attestation],
  };
}

export function manualMintExplorerUrl(
  destinationChain: Chain,
  txHash: string,
): string | undefined {
  return explorerTxUrl(destinationChain, txHash);
}
