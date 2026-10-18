/**
 * Refund primitives — a thin layer over the existing send flow that handles
 * metadata correlation for "send funds back to the original payer".
 *
 * The mechanics are identical to a regular send: the merchant signs a USDC
 * transfer from their wallet (on the chain where they received the original
 * payment) back to the original sender (on whatever chain they want the
 * refund delivered). What this module adds:
 *
 * 1. A `RefundInput` type that names the parts of a refund explicitly so
 *    integrations read clearly.
 * 2. `buildRefundMetadata()` — stamps the Whisk-internal correlation keys
 *    (`__refundOfTxHash`, `__refundReason`) that link the refund back to the
 *    original transfer. Used by `engine.refund()` and exposed for advanced
 *    callers that want to mint refund metadata themselves.
 * 3. `validateRefundInput()` — same pattern as deposit/spend validators.
 */
import type { Chain } from "../types/chain.js";
import type { WhiskMetadata } from "../metadata/types.js";
import { ConfigError } from "../errors/errors.js";
import { validateMetadata } from "../metadata/validate.js";

/** Reserved metadata key linking a refund to the original transfer's source-chain tx hash. */
export const REFUND_OF_TX_KEY = "__refundOfTxHash";
/** Reserved metadata key carrying the optional merchant-supplied reason code. */
export const REFUND_REASON_KEY = "__refundReason";

/**
 * Public-facing refund input. The engine validates via {@link validateRefundInput}
 * and applies the refund-correlation metadata internally.
 */
export type RefundInput = {
  /** Source-chain tx hash of the ORIGINAL transfer being refunded. */
  originalTxHash: string;
  /**
   * Chain where the original transfer landed — the merchant received the
   * payment here. This becomes the SOURCE for the refund.
   */
  originalDestinationChain: Chain;
  /**
   * Where the original sender wants the refund delivered. Typically the chain
   * they originally paid from. Same as `originalDestinationChain` for
   * same-chain refunds.
   */
  refundDestinationChain: Chain;
  /** Original sender's address — the refund recipient. */
  originalSenderAddress: string;
  /** Refund amount in human-readable USDC (e.g. `"10.50"`). May be partial. */
  amount: string;
  /** Optional human-readable reason. Echoed via `__refundReason` metadata. */
  reason?: string;
  /** Additional merchant metadata. Cannot use `__`-prefixed keys. */
  metadata?: WhiskMetadata;
};

/** Validated refund input with defaults applied. */
export type RefundPlan = {
  originalTxHash: string;
  originalDestinationChain: Chain;
  refundDestinationChain: Chain;
  originalSenderAddress: string;
  amount: string;
  reason: string | undefined;
  metadata: WhiskMetadata | undefined;
};

/**
 * Stamp the Whisk-internal refund-correlation keys onto a base metadata
 * object. The merchant's keys are preserved as-is; reserved keys are added on
 * top. The result bypasses {@link validateMetadata}'s reserved-prefix check
 * because Whisk itself owns these keys.
 *
 * Pass `merchantMetadata` already-merged with config defaults if you want
 * everything in one object — this helper only adds the refund keys.
 */
export function buildRefundMetadata(
  originalTxHash: string,
  reason: string | undefined,
  merchantMetadata: WhiskMetadata | undefined,
): WhiskMetadata {
  const out: WhiskMetadata = { ...(merchantMetadata ?? {}) };
  out[REFUND_OF_TX_KEY] = originalTxHash;
  if (reason !== undefined) {
    out[REFUND_REASON_KEY] = reason;
  }
  return out;
}

/**
 * Validate a {@link RefundInput} and normalize defaults. Pure.
 *
 * Rules enforced:
 * - `originalTxHash` non-empty.
 * - `originalSenderAddress` non-empty.
 * - `amount` must be a positive decimal string.
 * - Merchant `metadata` (when provided) must pass {@link validateMetadata}.
 *
 * Chain validity is enforced downstream by `decideRoute` + `chainInfo`, so we
 * don't duplicate that here — the chain registry is the source of truth.
 *
 * Throws {@link ConfigError} on any rule violation.
 */
export function validateRefundInput(input: RefundInput): RefundPlan {
  if (
    typeof input.originalTxHash !== "string" ||
    input.originalTxHash.trim().length === 0
  ) {
    throw new ConfigError(`refund: originalTxHash is required`);
  }
  if (
    typeof input.originalSenderAddress !== "string" ||
    input.originalSenderAddress.trim().length === 0
  ) {
    throw new ConfigError(`refund: originalSenderAddress is required`);
  }
  if (!isPositiveDecimal(input.amount)) {
    throw new ConfigError(
      `refund: amount "${input.amount}" must be a positive decimal string`,
    );
  }
  if (input.metadata !== undefined) {
    // This rejects `__`-prefixed keys, so the merchant can't shadow Whisk's
    // refund-correlation values.
    validateMetadata(input.metadata);
  }
  if (input.reason !== undefined) {
    if (typeof input.reason !== "string") {
      throw new ConfigError(`refund: reason must be a string`);
    }
    if (input.reason.length > 256) {
      throw new ConfigError(`refund: reason exceeds 256 characters`);
    }
  }
  return {
    originalTxHash: input.originalTxHash.trim(),
    originalDestinationChain: input.originalDestinationChain,
    refundDestinationChain: input.refundDestinationChain,
    originalSenderAddress: input.originalSenderAddress.trim(),
    amount: input.amount,
    reason: input.reason,
    metadata: input.metadata,
  };
}

function isPositiveDecimal(value: string): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return false;
  return /[1-9]/.test(trimmed);
}
