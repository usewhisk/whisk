/**
 * Manual-mint call descriptor — recovery layer.
 *
 * When the Forwarder reports `FAILED`, or the merchant explicitly opted
 * out, the user has to call `receiveMessage` themselves on the
 * destination chain. This module produces a wagmi/viem-ready descriptor
 * (`address` + `abi` + `functionName` + `args`) so `useReceipt` /
 * `useRefund` can hand it straight to `useWriteContract`.
 *
 * For raw calldata bytes (e.g. submitting via an EIP-5792 batch) use
 * `buildMintIntent` from `@usewhisk/cctp` directly.
 */
import {
  MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  messageTransmitterV2Abi,
} from "@usewhisk/cctp";
import type { Chain } from "../types/chain.js";
import { chainInfo, explorerTxUrl } from "../chains/registry.js";

/** EVM `MessageTransmitterV2` address — same across every EVM mainnet chain. */
export const EVM_MAINNET_MESSAGE_TRANSMITTER =
  MESSAGE_TRANSMITTER_V2_EVM_MAINNET;
/** EVM `MessageTransmitterV2` address — same across every EVM testnet chain. */
export const EVM_TESTNET_MESSAGE_TRANSMITTER =
  MESSAGE_TRANSMITTER_V2_EVM_TESTNET;
/** Solana `MessageTransmitterV2` program — reserved for future Solana support. */
export const SOLANA_MESSAGE_TRANSMITTER =
  "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC" as const;

/** ABI fragment exposed to consumers feeding wagmi's `useWriteContract`. */
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

/** Resolve the `MessageTransmitter` address for a chain. */
export function messageTransmitterAddress(chain: Chain): string | undefined {
  const info = chainInfo(chain);
  if (info.kind === "solana") return SOLANA_MESSAGE_TRANSMITTER;
  if (info.kind === "evm") {
    return info.network === "mainnet"
      ? EVM_MAINNET_MESSAGE_TRANSMITTER
      : EVM_TESTNET_MESSAGE_TRANSMITTER;
  }
  return undefined;
}

/**
 * Build a `MessageTransmitter.receiveMessage` call descriptor for the
 * destination chain. Returns `null` for non-EVM destinations (different
 * call surface, not in scope) or chains without a registered
 * MessageTransmitter. Throws on malformed hex inputs.
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
  const info = chainInfo(destinationChain);
  if (info.kind !== "evm") return null;

  const address = messageTransmitterAddress(destinationChain);
  if (!address) return null;

  return {
    destinationChain,
    address,
    abi: RECEIVE_MESSAGE_ABI,
    functionName: "receiveMessage",
    args: [message, attestation],
  };
}

/** Convenience wrapper around `explorerTxUrl` for the manual-mint tx. */
export function manualMintExplorerUrl(
  destinationChain: Chain,
  txHash: string,
): string | undefined {
  return explorerTxUrl(destinationChain, txHash);
}
