import type { ResolvedRecipient } from "./recipient.js";
import type { Route } from "./route.js";
import type { FeeBreakdown } from "./fee.js";
import type { Token } from "./token.js";
import type { RoutePlan } from "../routing/plan.js";

export type Quote = {
  route: Route;
  recipient: ResolvedRecipient;
  /** Total debited from the sender (display "You pay"). */
  amountIn: string;
  /** What the recipient receives (display "Recipient gets"). */
  amountOut: string;
  /**
   * On-chain transfer amount fed to App Kit. Equals `amountOut` in receiver
   * mode, grossed up by estimated fees in sender mode. Optional so externally
   * built quotes still type-check; consumers fall back to `amountOut`.
   */
  amountBurned?: string;
  token: Token;
  fees: FeeBreakdown;
  estimatedDurationMs?: number;
  /** Present on bridge quotes. */
  plan?: RoutePlan;
};
