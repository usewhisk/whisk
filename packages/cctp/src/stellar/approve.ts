/**
 * Stellar USDC SAC `approve` invocation builder.
 *
 * Stellar's TokenMessengerMinter pulls USDC via `transfer_from`, the
 * allowance-based pattern (same shape as EVM's ERC-20 + TokenMessenger).
 * Before a `deposit_for_burn[_with_hook]` can run, the caller must
 * authorize the TMM contract to spend the burn amount by calling
 * `approve(caller, tmm, amount, expiration_ledger)` on the USDC SAC.
 *
 * SAC `approve` signature (SEP-41):
 *   approve(from: Address, spender: Address, amount: i128, expiration_ledger: u32)
 */
import { Address, Contract, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import type { StellarChain } from "../chains/types.js";
import { InvalidInputError } from "../errors.js";
import type { StellarInvocation } from "./burn.js";

export type BuildStellarApproveInvocationInput = {
  source: StellarChain;
  /** Owner strkey (G/M/C). Wallet that's authorizing TMM to spend USDC. */
  owner: string;
  /** Spender — typically the chain's TMM contract (C…). */
  spender: string;
  /** Amount in 7-decimal Stellar USDC subunits. */
  amount: bigint;
  /**
   * Ledger sequence at which the allowance expires. Set to `0` for a
   * one-shot use (auto-clears after the next transfer_from), or a high
   * value for a long-lived allowance. Whisk uses one-shot — fresh
   * approve per burn keeps the security surface tight.
   */
  expirationLedger: number;
};

export function buildStellarApproveInvocation(
  input: BuildStellarApproveInvocationInput,
): StellarInvocation {
  if (input.source.ecosystem !== "stellar") {
    throw new InvalidInputError(
      "invalid_chain",
      `source must be Stellar, got ${input.source.ecosystem}`,
    );
  }
  if (input.amount <= 0n) {
    throw new InvalidInputError(
      "invalid_amount",
      `amount must be positive, got ${input.amount}`,
    );
  }
  if (input.expirationLedger < 0) {
    throw new InvalidInputError(
      "invalid_input",
      `expirationLedger must be ≥ 0, got ${input.expirationLedger}`,
    );
  }

  const args: xdr.ScVal[] = [
    new Address(input.owner).toScVal(),
    new Address(input.spender).toScVal(),
    nativeToScVal(input.amount, { type: "i128" }),
    nativeToScVal(input.expirationLedger, { type: "u32" }),
  ];

  const operation = new Contract(input.source.usdc).call("approve", ...args);

  return {
    ecosystem: "stellar",
    contractId: input.source.usdc,
    functionName: "approve",
    args,
    operation,
  };
}
