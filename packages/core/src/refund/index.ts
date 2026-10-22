/**
 * A refund is an ordinary send: the merchant pays from the chain where the
 * original payment landed, back to the original sender on the chain they
 * choose. This module adds the reserved metadata keys that link the refund
 * to the original transfer.
 */
import type { Chain } from "../types/chain.js";
import type { WhiskMetadata } from "../metadata/types.js";
import { ConfigError } from "../errors/errors.js";
import { validateMetadata } from "../metadata/validate.js";

/** Holds the original transfer's source-chain tx hash. */
export const REFUND_OF_TX_KEY = "__refundOfTxHash";
/** Holds the merchant's optional reason. */
export const REFUND_REASON_KEY = "__refundReason";

export type RefundInput = {
  /** Source-chain tx hash of the original transfer. */
  originalTxHash: string;
  /** Where the merchant received the original payment; the refund's source. */
  originalDestinationChain: Chain;
  /**
   * Where the refund is delivered, usually the chain the sender paid from.
   * Equal to `originalDestinationChain` for a same-chain refund.
   */
  refundDestinationChain: Chain;
  /** The refund recipient. */
  originalSenderAddress: string;
  /** Decimal USDC, such as `"10.50"`. May be less than the original. */
  amount: string;
  /** At most 256 characters. Echoed as `__refundReason` metadata. */
  reason?: string;
  /** Cannot use `__`-prefixed keys. */
  metadata?: WhiskMetadata;
};

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
 * Adds the reserved refund keys on top of `merchantMetadata`, overwriting any
 * merchant key of the same name. It does not merge config defaults; pass
 * already-merged metadata for that.
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
 * Throws {@link ConfigError} unless `originalTxHash` and
 * `originalSenderAddress` are non-empty, `amount` is a positive decimal, and
 * `metadata` passes {@link validateMetadata}. Chains are checked later, when
 * the refund is quoted.
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
