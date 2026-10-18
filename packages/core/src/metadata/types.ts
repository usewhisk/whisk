/**
 * Merchant-defined correlation metadata that travels with a Whisk transfer.
 *
 * Used for order IDs, internal references, SKUs, campaign codes, and other
 * correlation data that the merchant wants echoed back in `onSuccess` and
 * server-to-server webhook deliveries.
 *
 * Stored client-side in localStorage alongside the recovery snapshot, so
 * mid-flight failures preserve the metadata for the eventual recovery.
 *
 * SAFETY: Metadata is stored in the user's browser localStorage. Do not put
 * PII, payment credentials, emails, or anything sensitive here. Use it for
 * correlation references only.
 *
 * Constraints (enforced by {@link validateMetadata}):
 * - Values must be `string | number | boolean` (no nested objects, no arrays).
 * - Serialized JSON size capped at 1 KB total.
 * - Keys starting with `__` are reserved for Whisk internals.
 */
export type WhiskMetadata = Record<string, string | number | boolean>;

/** Maximum serialized JSON size for metadata, in bytes. */
export const METADATA_MAX_BYTES = 1024;

/** Prefix reserved for Whisk-internal keys. Merchant metadata cannot use it. */
export const METADATA_RESERVED_PREFIX = "__";
