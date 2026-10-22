/**
 * Anchor instruction discriminators for CCTP V2's Solana programs.
 *
 * Every Anchor instruction is prefixed with the first 8 bytes of
 * `sha256("global:" + snakeCaseName)`.
 */
import { sha256 } from "@noble/hashes/sha256";

/**
 * Snake-case the name as the Rust function declares it
 * (`deposit_for_burn`, not `depositForBurn`).
 *
 * Uses `@noble/hashes` because this runs at module load in browser
 * bundles, where `node:crypto` isn't available.
 */
export function anchorDiscriminator(snakeCaseName: string): Uint8Array {
  const bytes = new TextEncoder().encode(`global:${snakeCaseName}`);
  return sha256(bytes).slice(0, 8);
}

/** TokenMessengerMinterV2 `deposit_for_burn` (no hook data). */
export const DISCRIMINATOR_DEPOSIT_FOR_BURN: Uint8Array =
  anchorDiscriminator("deposit_for_burn");

/** TokenMessengerMinterV2 `deposit_for_burn_with_hook`. */
export const DISCRIMINATOR_DEPOSIT_FOR_BURN_WITH_HOOK: Uint8Array =
  anchorDiscriminator("deposit_for_burn_with_hook");

/** MessageTransmitterV2 `receive_message`. */
export const DISCRIMINATOR_RECEIVE_MESSAGE: Uint8Array =
  anchorDiscriminator("receive_message");
