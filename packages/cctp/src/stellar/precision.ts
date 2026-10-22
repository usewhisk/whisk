/**
 * Stellar USDC ↔ CCTP precision conversion.
 *
 * Stellar's USDC asset uses 7 decimals natively; CCTP messages always
 * carry 6-decimal subunits. The protocol drops the 7th decimal on
 * outbound burns (dust stays in the user's account) and multiplies by
 * 10 on inbound mints.
 */
import {
  CCTP_USDC_DECIMALS,
  STELLAR_USDC_DECIMALS,
} from "../chains/constants.js";

const DECIMAL_FACTOR =
  10n ** BigInt(STELLAR_USDC_DECIMALS - CCTP_USDC_DECIMALS);

/**
 * Convert from Stellar's 7-decimal subunit amount to CCTP's 6-decimal
 * canonical amount. Drops the 7th decimal (rounds toward zero). The
 * dust stays on Stellar; it's not lost in the bridge.
 *
 * @returns 6-decimal subunits (canonical amount for the CCTP message)
 */
export function stellarSubunitsToCanonical(stellarSubunits: bigint): bigint {
  if (stellarSubunits < 0n) {
    throw new RangeError(
      `stellarSubunitsToCanonical: amount must be non-negative, got ${stellarSubunits}`,
    );
  }
  return stellarSubunits / DECIMAL_FACTOR;
}

/**
 * Convert from CCTP's 6-decimal canonical amount to Stellar's 7-decimal
 * subunit amount. Scales by 10, as the inbound mint does.
 *
 * @returns 7-decimal subunits (the on-chain amount minted on Stellar)
 */
export function canonicalToStellarSubunits(canonicalSubunits: bigint): bigint {
  if (canonicalSubunits < 0n) {
    throw new RangeError(
      `canonicalToStellarSubunits: amount must be non-negative, got ${canonicalSubunits}`,
    );
  }
  return canonicalSubunits * DECIMAL_FACTOR;
}

/**
 * The fractional 7th decimal that a burn from Stellar drops and leaves
 * in the sender's account.
 */
export function stellarBurnDust(stellarSubunits: bigint): bigint {
  return stellarSubunits % DECIMAL_FACTOR;
}
