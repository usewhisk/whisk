/**
 * Amount helpers.
 *
 * The public API takes human-readable strings ("1.50") and the protocol
 * layer expects USDC subunits as bigint (6 decimals). These helpers
 * convert between the two with strict validation.
 */
import { ConfigError } from "../errors/errors.js";

/** USDC fixed at 6 decimals across every supported chain. */
export const USDC_DECIMALS = 6;

const AMOUNT_REGEX = /^(\d+)(?:\.(\d+))?$/;

/**
 * Parse a human amount string into USDC subunits.
 *
 * Rejects empty input, scientific notation, sign characters, and any
 * non-digit/dot character. Trailing fractional digits beyond
 * {@link USDC_DECIMALS} are truncated (NOT rounded) to avoid silent
 * over-debits at the edges.
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

/** Format USDC subunits back into a human amount with trailing zeros stripped. */
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
