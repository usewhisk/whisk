import type { ResolvedRecipient } from "./recipient.js";
import type { Quote } from "./quote.js";
import type { Step } from "./step.js";
import type { WhiskError } from "../errors/errors.js";

export type WhiskState =
  | { kind: "disconnected" }
  | { kind: "idle" }
  | { kind: "resolving"; input: string }
  | { kind: "resolved"; recipient: ResolvedRecipient }
  | { kind: "quoting"; recipient: ResolvedRecipient; amount: string }
  | { kind: "review"; quote: Quote }
  | {
      kind: "sending";
      quote: Quote;
      steps: Step[];
      currentStep: Step["name"];
    }
  | {
      kind: "succeeded";
      quote: Quote;
      steps: Step[];
      finalTxHash?: string;
    }
  | {
      kind: "failed";
      error: WhiskError;
      quote?: Quote;
      steps?: Step[];
      /** Recovery snapshot of the failed send. Retry needs it to resume from the failed step instead of burning again. */
      raw?: unknown;
    };

export type WhiskStateKind = WhiskState["kind"];
