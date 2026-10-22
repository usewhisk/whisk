import type { ResolvedRecipient } from "./recipient.js";
import type { Route } from "./route.js";
import type { FeeBreakdown } from "./fee.js";
import type { Token } from "./token.js";
import type { RoutePlan } from "../routing/plan.js";

/** USDC subunits behind a quote. `send` signs these, not the strings. */
export type QuoteSubunits = {
  /** The amount the payer entered. */
  requested: bigint;
  /** Debited from the payer, merchant fee included. */
  amountIn: bigint;
  burnAmount: bigint;
  /** The protocol fee Iris quotes, before the Fast buffer. */
  burnFee: bigint;
  forwarderFee: bigint;
  maxFee: bigint;
  /** The least the recipient gets. */
  amountOut: bigint;
  customFee: bigint;
};

export type Quote = {
  /** New for every quote, including a refreshed one. */
  id: string;
  /** Milliseconds since the epoch. */
  issuedAt: number;
  /** `send` refuses the quote after this, in milliseconds since the epoch. */
  expiresAt: number;
  /**
   * `maxFee`: Circle deducts its fee from the burn, capped by `maxFee`.
   * `upfront`: the payer pays Circle's signed fee beside the burn, at most
   * `subunits.maxFee`, and the whole burn mints.
   */
  feeMode: "maxFee" | "upfront";
  route: Route;
  recipient: ResolvedRecipient;
  /** Total debited from the sender (display "You pay"). */
  amountIn: string;
  /** What the recipient receives at least (display "Recipient gets"). */
  amountOut: string;
  amountBurned: string;
  token: Token;
  fees: FeeBreakdown;
  subunits: QuoteSubunits;
  estimatedDurationMs?: number;
  /** Present on bridge quotes. */
  plan?: RoutePlan;
};
