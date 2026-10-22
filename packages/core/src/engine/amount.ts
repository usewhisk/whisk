import { ConfigError } from "../errors/errors.js";

/** The decimals CCTP messages carry. Stellar's 7 are scaled at the edge. */
export const USDC_DECIMALS = 6;

const AMOUNT_REGEX = /^(\d+)(?:\.(\d+))?$/;

/**
 * Parses a human amount such as `"1.50"` into USDC subunits. Rejects
 * scientific notation, signs and anything but digits and one dot. Digits
 * past {@link USDC_DECIMALS} are truncated, not rounded, so the payer is
 * never debited more than they typed.
 */
export function parseUsdcAmount(input: string): bigint {
  const trimmed = input.trim();
  const match = AMOUNT_REGEX.exec(trimmed);
  if (!match) {
    throw new ConfigError(`parseUsdcAmount: "${input}" is not a valid amount.`);
  }
  const whole = match[1] ?? "0";
  const fractionRaw = match[2] ?? "";
  const fraction = fractionRaw
    .slice(0, USDC_DECIMALS)
    .padEnd(USDC_DECIMALS, "0");
  const subunits =
    BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fraction);
  if (subunits <= 0n) {
    throw new ConfigError(
      `parseUsdcAmount: amount must be positive, got "${input}".`,
    );
  }
  return subunits;
}

/** Trailing zeros are stripped. */
export function formatUsdcAmount(subunits: bigint): string {
  if (subunits < 0n) {
    throw new ConfigError(
      `formatUsdcAmount: subunits must be non-negative, got ${subunits}.`,
    );
  }
  const divisor = 10n ** BigInt(USDC_DECIMALS);
  const whole = subunits / divisor;
  const fraction = subunits % divisor;
  if (fraction === 0n) return whole.toString();
  const fractionStr = fraction
    .toString()
    .padStart(USDC_DECIMALS, "0")
    .replace(/0+$/, "");
  return `${whole}.${fractionStr}`;
}
