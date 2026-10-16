/**
 * Whisk treasury — destination for the platform share of merchant fees.
 *
 * When a merchant configures `feePolicy.value`, that's the TOTAL fee
 * the end user pays on top of the transfer amount. Whisk splits it
 * 90/10: 90% to `feePolicy.recipient` (the merchant), 10% to the
 * address below. The split does not change what the user pays.
 *
 * The treasury is a single EOA that's the same on every EVM chain.
 */

/** Whisk treasury address — receives the 10% platform share. */
export const WHISK_TREASURY_ADDRESS =
  "0x404b07e55c6a4F1eA10e94e3d9404b7685E18238" as `0x${string}`;

/** Whisk treasury share, in basis points (10% = 1000 bps). */
export const WHISK_TREASURY_BPS = 1000n;

/** Total basis-point denominator (100% = 10000 bps). */
export const BPS_DENOMINATOR = 10_000n;

export type CustomFeeSplit = {
  /** Amount paid to `feePolicy.recipient`, in USDC subunits. */
  merchant: bigint;
  /** Amount paid to {@link WHISK_TREASURY_ADDRESS}, in USDC subunits. */
  whisk: bigint;
};

/**
 * Split a customFee total between the merchant (90%) and the Whisk
 * treasury (10%). Uses bigint math so the two shares sum exactly to
 * `total` — no rounding drift. The merchant gets the larger share when
 * the split doesn't divide evenly, so micro-fee amounts never undercut
 * the integrator.
 */
export function splitCustomFee(total: bigint): CustomFeeSplit {
  if (total <= 0n) {
    return { merchant: 0n, whisk: 0n };
  }
  const whisk = (total * WHISK_TREASURY_BPS) / BPS_DENOMINATOR;
  const merchant = total - whisk;
  return { merchant, whisk };
}
