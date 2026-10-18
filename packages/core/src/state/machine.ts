import type { ResolvedRecipient } from "../types/recipient.js";
import type { Quote } from "../types/quote.js";
import type { Step, StepName } from "../types/step.js";
import type { WhiskState } from "../types/state.js";
import type { WhiskError } from "../errors/errors.js";

export type HydrateFailedPayload = {
  error: WhiskError;
  quote: Quote;
  steps: Step[];
  raw: unknown;
};

export type WhiskAction =
  | { type: "CONNECTED" }
  | { type: "DISCONNECTED" }
  | { type: "RESET" }
  | { type: "RESOLVE_START"; input: string }
  | { type: "RESOLVE_SUCCESS"; recipient: ResolvedRecipient }
  | { type: "RESOLVE_FAILURE"; error: WhiskError }
  | { type: "QUOTE_START"; recipient: ResolvedRecipient; amount: string }
  | { type: "QUOTE_SUCCESS"; quote: Quote }
  | { type: "QUOTE_FAILURE"; error: WhiskError }
  | { type: "REVIEW_BACK" }
  | { type: "SEND_START" }
  | { type: "STEP_UPDATE"; step: Step }
  | { type: "SEND_SUCCESS"; finalTxHash?: string }
  | { type: "SEND_FAILURE"; error: WhiskError; raw?: unknown }
  | { type: "RETRY_START" }
  | { type: "HYDRATE_FAILED"; payload: HydrateFailedPayload };

const BRIDGE_STEPS: StepName[] = [
  "approve",
  "burn",
  "fetchAttestation",
  "mint",
];
const SEND_STEPS: StepName[] = ["approve", "transfer"];

export function initialSteps(routeKind: "send" | "bridge"): Step[] {
  const names = routeKind === "send" ? SEND_STEPS : BRIDGE_STEPS;
  return names.map((name) => ({ name, state: "pending" }));
}

/** Invalid (state, action) pairs no-op rather than throw. */
export function reduce(state: WhiskState, action: WhiskAction): WhiskState {
  switch (action.type) {
    case "CONNECTED":
      return state.kind === "disconnected" ? { kind: "idle" } : state;

    case "DISCONNECTED":
      return { kind: "disconnected" };

    case "RESET":
      return state.kind === "disconnected" ? state : { kind: "idle" };

    case "RESOLVE_START":
      if (state.kind !== "idle" && state.kind !== "resolved") return state;
      return { kind: "resolving", input: action.input };

    case "RESOLVE_SUCCESS":
      if (state.kind !== "resolving") return state;
      return { kind: "resolved", recipient: action.recipient };

    case "RESOLVE_FAILURE":
      if (state.kind !== "resolving") return state;
      return { kind: "failed", error: action.error };

    case "QUOTE_START":
      if (state.kind !== "resolved" && state.kind !== "review") return state;
      return {
        kind: "quoting",
        recipient: action.recipient,
        amount: action.amount,
      };

    case "QUOTE_SUCCESS":
      if (state.kind !== "quoting") return state;
      return { kind: "review", quote: action.quote };

    case "QUOTE_FAILURE":
      if (state.kind !== "quoting") return state;
      return { kind: "failed", error: action.error };

    case "REVIEW_BACK":
      if (state.kind !== "review") return state;
      return { kind: "resolved", recipient: state.quote.recipient };

    case "SEND_START": {
      if (state.kind !== "review") return state;
      const steps = initialSteps(state.quote.route.kind);
      const first = steps[0];
      if (!first) return state;
      return {
        kind: "sending",
        quote: state.quote,
        steps,
        currentStep: first.name,
      };
    }

    case "STEP_UPDATE": {
      if (state.kind !== "sending") return state;
      const steps = state.steps.map((s) =>
        s.name === action.step.name ? { ...s, ...action.step } : s,
      );
      const nextPending = steps.find((s) => s.state === "pending");
      return {
        ...state,
        steps,
        currentStep: nextPending?.name ?? state.currentStep,
      };
    }

    case "SEND_SUCCESS":
      if (state.kind !== "sending") return state;
      return {
        kind: "succeeded",
        quote: state.quote,
        steps: state.steps,
        finalTxHash: action.finalTxHash,
      };

    case "SEND_FAILURE":
      if (state.kind !== "sending") return state;
      return {
        kind: "failed",
        error: action.error,
        quote: state.quote,
        steps: state.steps,
        raw: action.raw,
      };

    case "HYDRATE_FAILED": {
      // Only valid right after connect, so an in-progress flow isn't clobbered.
      if (state.kind !== "idle") return state;
      const { error, quote, steps, raw } = action.payload;
      return { kind: "failed", error, quote, steps, raw };
    }

    case "RETRY_START": {
      if (state.kind !== "failed") return state;
      if (!state.quote || !state.steps || state.raw === undefined) return state;
      const nextPending = state.steps.find((s) => s.state !== "success");
      const fallback = state.steps[state.steps.length - 1];
      const currentStep = nextPending?.name ?? fallback?.name;
      if (!currentStep) return state;
      return {
        kind: "sending",
        quote: state.quote,
        steps: state.steps,
        currentStep,
      };
    }

    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}

export const initialState: WhiskState = { kind: "disconnected" };
