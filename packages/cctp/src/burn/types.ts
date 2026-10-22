/**
 * A burn intent is the chain-bound call(s) the wallet adapter signs
 * and submits. It contains no transaction-level data (gas, nonce);
 * the adapter fills those in.
 */
import type { Address, CctpChain } from "../chains/types.js";
import type { FinalityThreshold } from "../iris/types.js";

/**
 * One on-chain call. A bridge is usually an `approve` followed by the burn;
 * the wallet adapter may batch them via EIP-5792 when supported.
 */
export type EvmCall = {
  to: Address;
  data: `0x${string}`;
  /** Always `0n`: USDC burns carry no native value. */
  value: bigint;
};

export type BurnIntent = {
  source: CctpChain;
  destination: CctpChain;
  /** Executed in order. */
  calls: EvmCall[];
  /** USDC subunits, 6 decimals. */
  amount: bigint;
  /** `maxFee` cap that was packed into the burn call. */
  maxFee: bigint;
  /** Computed protocol fee, for a fee breakdown. */
  burnFee: bigint;
  /** Computed forwarder fee. `0n` when the forwarder is off. */
  forwarderFee: bigint;
  mintRecipientBytes32: `0x${string}`;
  /** Whether the burn call set `hookData` for Forwarder use. */
  withForwarder: boolean;
  finalityThreshold: FinalityThreshold;
};
