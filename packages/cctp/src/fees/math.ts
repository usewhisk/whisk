/**
 * Fee math for CCTP V2 bridges.
 *
 * Two protocol-level fees stack on a Fast Transfer + Forwarder bridge:
 *
 *   1. Burn fee: a rate on the transfer amount, charged by CCTP. Iris
 *      returns `minimumFee` in basis points with up to two decimals
 *      (`1.3` is 0.013%). Whisk holds it as hundredths of a basis
 *      point, so `1.3` becomes `130n`.
 *
 *   2. Forwarder fee: a flat USDC fee that pays for destination gas
 *      and the relayer. Iris returns low, med and high levels in USDC
 *      subunits. Whisk defaults to `med`.
 *
 * `maxFee` on `depositForBurnWithHook` must cover both. Every step
 * rounds up: a `maxFee` one subunit short turns a Fast transfer into a
 * Standard one.
 */

import type { BurnFeeTier, ForwarderFeeTier } from "../iris/types.js";
import { InvalidInputError, IrisParseError, ProtocolError } from "../errors.js";

const CENTI_BPS_PER_UNIT = 1_000_000n;

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

// JSON numbers reach us already parsed. String() gives back the shortest
// decimal that round-trips, which is the literal Iris sent for any value
// with 15 or fewer significant digits. Exponent forms are refused.
function ceilDecimal(raw: unknown, decimals: number, what: string): bigint {
  const text =
    typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : "";
  const match = DECIMAL.exec(text);
  if (!match) {
    throw new IrisParseError(`Iris ${what} is invalid: ${String(raw)}`);
  }
  const fraction = match[2] ?? "";
  const kept = fraction.slice(0, decimals).padEnd(decimals, "0");
  const dropped = /[1-9]/.test(fraction.slice(decimals)) ? 1n : 0n;
  return BigInt((match[1] ?? "0") + kept) + dropped;
}

/** Iris's `minimumFee` as hundredths of a basis point: `1.3` is `130n`. */
export function parseFeeBps(raw: unknown): bigint {
  return ceilDecimal(raw, 2, "minimumFee");
}

/** An Iris forwarder fee in USDC subunits, rounded up. */
export function parseForwarderFee(raw: unknown): bigint {
  return ceilDecimal(raw, 0, "forwardFee");
}

/**
 * The CCTP burn fee on `amount` subunits at `feeCentiBps` hundredths of
 * a basis point, rounded up.
 */
export function computeBurnFee(amount: bigint, feeCentiBps: bigint): bigint {
  if (amount < 0n) {
    throw new InvalidInputError(
      "invalid_amount",
      `amount must be non-negative, got ${amount}`,
    );
  }
  if (feeCentiBps < 0n) {
    throw new InvalidInputError(
      "invalid_input",
      `feeCentiBps must be non-negative, got ${feeCentiBps}`,
    );
  }
  return ceilDiv(amount * feeCentiBps, CENTI_BPS_PER_UNIT);
}

/** The forwarder fee for a level, in USDC subunits. */
export function selectForwarderFee(
  tier: BurnFeeTier,
  level: keyof ForwarderFeeTier = "med",
): bigint {
  if (!tier.forwardFee) {
    throw new ProtocolError(
      "fee_unavailable",
      "Tier has no forwardFee. Fetch burn fees with includeForwarderFee=true",
    );
  }
  const value = tier.forwardFee[level];
  if (value < 0n) {
    throw new ProtocolError(
      "fee_unavailable",
      `Invalid forwardFee.${level}: ${value}`,
    );
  }
  return value;
}

export type ComputeMaxFeeInput = {
  /** Transfer amount in USDC subunits. */
  amount: bigint;
  /** Selected tier (Fast or Standard). */
  tier: BurnFeeTier;
  /** Forwarder tier; defaults to `"med"`. */
  forwarderLevel?: keyof ForwarderFeeTier;
  /**
   * Whole basis points added to the forwarder fee (0 to 10000). Iris's
   * `high` level already carries a buffer, so this defaults to 0.
   */
  forwarderBufferBps?: number;
  /** Whether to include the forwarder fee. Defaults to `true`. */
  includeForwarder?: boolean;
  /**
   * Whole basis points added to the protocol fee in `maxFee` only. Circle
   * takes the fee it executes, so the buffer is a ceiling, not a charge.
   */
  burnFeeBufferBps?: number;
  /** The on-chain minimum from `getMinFeeAmount`, in USDC subunits. */
  minBurnFee?: bigint;
};

export type ComputeMaxFeeResult = {
  /** The protocol fee Iris quotes, before any buffer. */
  burnFee: bigint;
  forwarderFee: bigint;
  /** Total cap to pass as `maxFee` on `depositForBurnWithHook`. */
  maxFee: bigint;
};

/**
 * Compute `maxFee` for a CCTP V2 bridge.
 *
 *   maxFee = burnFee (+ buffer) + forwarderFee (+ buffer)
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
    burnFeeBufferBps = 0,
    minBurnFee = 0n,
  } = input;

  const irisFee = computeBurnFee(amount, tier.minimumFee);
  const burnFee = irisFee > minBurnFee ? irisFee : minBurnFee;
  const forwarderFee = includeForwarder
    ? applyBufferBps(
        selectForwarderFee(tier, forwarderLevel),
        forwarderBufferBps,
      )
    : 0n;

  return {
    burnFee,
    forwarderFee,
    maxFee: applyBufferBps(burnFee, burnFeeBufferBps) + forwarderFee,
  };
}

function applyBufferBps(value: bigint, bps: number): bigint {
  if (!Number.isSafeInteger(bps) || bps < 0) {
    throw new InvalidInputError(
      "invalid_input",
      `bufferBps must be a non-negative whole number, got ${bps}`,
    );
  }
  return ceilDiv(value * (10_000n + BigInt(bps)), 10_000n);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}
