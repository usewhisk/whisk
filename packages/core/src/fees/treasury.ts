/**
 * `feePolicy.value` is the total fee the payer adds on top of the transfer.
 * Whisk splits it 90/10 between `feePolicy.recipient` and this address; the
 * split does not change what the payer pays. One EOA, the same on every EVM
 * chain.
 */
export const WHISK_TREASURY_ADDRESS =
  "0x404b07e55c6a4F1eA10e94e3d9404b7685E18238" as `0x${string}`;

/** Treasury share in basis points (10%). */
export const WHISK_TREASURY_BPS = 1000n;

/** 100% in basis points. */
export const BPS_DENOMINATOR = 10_000n;

export type CustomFeeSplit = {
  /** Amount paid to `feePolicy.recipient`, in USDC subunits. */
  merchant: bigint;
  /** Amount paid to {@link WHISK_TREASURY_ADDRESS}, in USDC subunits. */
  whisk: bigint;
};

/**
 * Split a custom fee 90/10 between the merchant and the treasury. The shares
 * always sum to `total`, and the merchant keeps the remainder when it does
 * not divide evenly.
 */
export function splitCustomFee(total: bigint): CustomFeeSplit {
  if (total <= 0n) {
    return { merchant: 0n, whisk: 0n };
  }
  const whisk = (total * WHISK_TREASURY_BPS) / BPS_DENOMINATOR;
  const merchant = total - whisk;
  return { merchant, whisk };
}
