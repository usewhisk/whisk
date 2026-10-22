import type { Token } from "./token.js";

/**
 * Merchant fee the payer pays on top of every transfer, split 90% to
 * `recipient` and 10% to the Whisk treasury.
 */
export type FeePolicy = {
  /** Decimal USDC amount, such as `"0.25"`. */
  value?: string;
  /** Not supported yet; the engine ignores it. */
  bps?: number;
  recipient: string;
};

export type FeeEntryKind =
  | "custom"
  | "protocol"
  | "gas"
  | "forwarder"
  | "provider";

/**
 * Who absorbs the CCTP protocol and Forwarder fees on a bridge.
 *
 * - `"sender"` (default): the burn is sized up by the estimated fees so the
 *   recipient receives the full `amount`. The sender's debit grows to cover
 *   the fees. Because the fee tier is read at quote time, the delivered
 *   amount can differ by a few cents if destination gas shifts before the
 *   mint lands.
 * - `"receiver"`: fees are deducted from the bridged amount, so the
 *   recipient nets `amount − fees`. The sender's debit equals `amount`.
 *
 * Bridges only. A same-chain Send has no protocol fees.
 */
export type FeeBearer = "sender" | "receiver";

/** Used when `WhiskConfig.feeBearer` is omitted. */
export const DEFAULT_FEE_BEARER: FeeBearer = "sender";

export type FeeEntry = {
  kind: FeeEntryKind;
  amount: string;
  token: Token | "NATIVE";
  recipient?: string;
  description?: string;
};

export type FeeBreakdown = {
  total: string;
  token: Token;
  entries: FeeEntry[];
};
