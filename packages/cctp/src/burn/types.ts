/**
 * Burn intent shapes — what the engine receives back from a builder.
 *
 * A burn intent is the chain-bound call(s) the wallet adapter signs
 * and submits. It contains no transaction-level data (gas, nonce);
 * the adapter fills those in.
 */
import type { Address, CctpChain } from "../chains/types.js";

/**
 * One on-chain call: target contract + calldata + optional value.
 *
 * For a USDC bridge the engine produces TWO calls in sequence — first
 * an `approve` (or permit, future), then `depositForBurnWithHook`.
 * The wallet adapter may batch them via EIP-5792 when supported.
 */
export type EvmCall = {
  to: Address;
  data: `0x${string}`;
  /** Always `0n` for USDC bridges; included for completeness. */
  value: bigint;
};

export type BurnIntent = {
  /** Source chain entry — handy for the engine to render UI without re-querying. */
  source: CctpChain;
  /** Destination chain entry. */
  destination: CctpChain;
  /** Sequence of calls the adapter must execute in order. */
  calls: EvmCall[];
  /** Mirrors the inputs so callers can audit what's being signed. */
  amount: bigint;
  /** `maxFee` cap that was packed into the burn call. */
  maxFee: bigint;
  /** Computed protocol fee component (for fee-breakdown UI). */
  burnFee: bigint;
  /** Computed forwarder fee component. `0n` when forwarder is off. */
  forwarderFee: bigint;
  /** Mint recipient on the destination chain, as bytes32. */
  mintRecipientBytes32: `0x${string}`;
  /** Whether the burn call set `hookData` for Forwarder use. */
  withForwarder: boolean;
  /** Finality threshold packed into the burn call. */
  finalityThreshold: number;
};
