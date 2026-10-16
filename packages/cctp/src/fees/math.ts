/**
 * Fee math for CCTP V2 bridges.
 *
 * Two protocol-level fees stack on a Fast Transfer + Forwarder bridge:
 *
 *   1. Burn fee — a percentage of the transfer amount, charged by
 *      CCTP. Iris returns `minimumFee` scaled by 100 to preserve
 *      0.01 bps precision (so `minimumFee: 1.3` means 1.3 bps, which
 *      is 0.013% of the amount).
 *
 *   2. Forwarder fee — a flat USDC fee that pays for destination gas
 *      and the Orbit relayer's service surcharge. Iris returns three
 *      tiers (low / med / high). Whisk defaults to `med` and bumps to
 *      `high` when destination gas is volatile.
 *
 * `maxFee` on `depositForBurnWithHook` must cover both. The actual
 * deducted fee can be less than `maxFee`; the unused budget goes to
 * priority gas on the destination chain (Circle does not refund).
 */

import type { BurnFeeTier, ForwarderFeeTier } from "../iris/types.js";
import { InvalidInputError, ProtocolError } from "../errors.js";

/**
 * Iris returns `minimumFee` as a bps decimal (e.g. `1.3` = 1.3 bps =
 * 0.013%). To stay in integer math we scale by 100 internally:
 *
 *   scaledFee = ceil(minimumFee * 100)         e.g. 1.3 → 130
 *   burnFee   = (amount × scaledFee) / 1_000_000
 *
 * For 1 USDC (= 1_000_000 subunits) at 1.3 bps:
 *   (1_000_000 × 130) / 1_000_000 = 130 subunits = $0.00013   ✓
 */
const BPS_INTERNAL_DIVISOR = 1_000_000n;

/**
 * Compute the CCTP burn fee for a given amount.
 *
 * `bps` is the value Iris returns (1.3 means 1.3 bps). Result is in
 * USDC subunits, ceil-rounded so the caller never under-quotes.
 */
export function computeBurnFee(amount: bigint, bps: number): bigint {
  if (amount < 0n) {
    throw new InvalidInputError(
      "invalid_amount",
      `amount must be non-negative, got ${amount}`,
    );
  }
  if (!Number.isFinite(bps) || bps < 0) {
    throw new InvalidInputError(
      "invalid_input",
      `bps must be a non-negative finite number, got ${bps}`,
    );
  }
  const scaledFee = BigInt(Math.ceil(bps * 100));
  return (amount * scaledFee) / BPS_INTERNAL_DIVISOR;
}

/**
 * Pick the right forwarder fee for a tier. Higher tier = more
 * priority gas budget on the destination.
 *
 * Returns USDC subunits (bigint).
 */
export function selectForwarderFee(
  tier: BurnFeeTier,
  level: keyof ForwarderFeeTier = "med",
): bigint {
  if (!tier.forwardFee) {
    throw new ProtocolError(
      "fee_unavailable",
      "Tier has no forwardFee — fetch burn fees with includeForwarderFee=true",
    );
  }
  const value = tier.forwardFee[level];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ProtocolError(
      "fee_unavailable",
      `Invalid forwardFee.${level}: ${String(value)}`,
    );
  }
  return BigInt(Math.ceil(value));
}

export type ComputeMaxFeeInput = {
  /** Transfer amount in USDC subunits. */
  amount: bigint;
  /** Selected tier (Fast or Standard). */
  tier: BurnFeeTier;
  /** Forwarder tier; defaults to `"med"`. */
  forwarderLevel?: keyof ForwarderFeeTier;
  /**
   * Optional buffer to add to the forwarder fee in basis points
   * (0–10000). Whisk defaults to 0 — the Iris `high` tier already
   * includes a buffer. Apply a buffer only when burning during known
   * gas spikes.
   */
  forwarderBufferBps?: number;
  /** Whether to include the forwarder fee. Defaults to `true`. */
  includeForwarder?: boolean;
};

export type ComputeMaxFeeResult = {
  burnFee: bigint;
  forwarderFee: bigint;
  /** Total cap to pass as `maxFee` on `depositForBurnWithHook`. */
  maxFee: bigint;
};

/**
 * Compute `maxFee` for a CCTP V2 bridge.
 *
 *   maxFee = burnFee + forwarderFee (+ buffer)
 *
 * The result is a cap; the actual deducted fee can be less.
 */
export function computeMaxFee(input: ComputeMaxFeeInput): ComputeMaxFeeResult {
  const {
    amount,
    tier,
    forwarderLevel = "med",
    forwarderBufferBps = 0,
    includeForwarder = true,
  } = input;

  const burnFee = computeBurnFee(amount, tier.minimumFee);
  const forwarderFee = includeForwarder
    ? applyBufferBps(
        selectForwarderFee(tier, forwarderLevel),
        forwarderBufferBps,
      )
    : 0n;

  return {
    burnFee,
    forwarderFee,
    maxFee: burnFee + forwarderFee,
  };
}

function applyBufferBps(value: bigint, bps: number): bigint {
  if (!Number.isFinite(bps) || bps < 0) {
    throw new InvalidInputError(
      "invalid_input",
      `bufferBps must be a non-negative finite number, got ${bps}`,
    );
  }
  if (bps === 0) return value;
  const bpsBig = BigInt(Math.ceil(bps));
  return (value * (10_000n + bpsBig)) / 10_000n;
}
