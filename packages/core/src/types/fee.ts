import type { Token } from "./token.js";

/**
 * Custom merchant fee collected on top of every Whisk transfer. The
 * fee is split: 90% goes to `recipient`, 10% to the Whisk treasury.
 */
export type FeePolicy = {
  /** Absolute USDC amount. Mutually exclusive with `bps`. */
  value?: string;
  /** Basis points on the transfer amount. Mutually exclusive with `value`. */
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
 * Who absorbs the CCTP protocol + Forwarder fees on a bridge.
 *
 * - `"sender"` (default): the burn is sized up by the estimated fees so the
 *   recipient receives the full `amount`. The sender's debit grows to cover
 *   the fees. Because the fee tier is read at quote time, the delivered
 *   amount can differ by a few cents if destination gas shifts before the
 *   mint lands.
 * - `"receiver"`: fees are deducted from the bridged amount, so the
 *   recipient nets `amount − fees`. The sender's debit equals `amount`.
 *
 * No fees on same-chain Send — `feeBearer` is bridge-only.
 */
export type FeeBearer = "sender" | "receiver";

/** Engine-wide default applied when `WhiskConfig.feeBearer` is omitted. */
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
