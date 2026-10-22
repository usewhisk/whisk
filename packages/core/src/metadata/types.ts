/**
 * Merchant correlation data echoed back on the `SendResult`, in `onSuccess`,
 * and in signed webhooks: order IDs, internal references, SKUs, campaign
 * codes.
 *
 * It passes through the payer's browser. Do not put PII, payment
 * credentials, emails, or anything sensitive here.
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
