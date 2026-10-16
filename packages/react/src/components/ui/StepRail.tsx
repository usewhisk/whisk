"use client";

import type { Step, StepName } from "@usewhisk/core";
import { cn } from "../../lib/cn.js";

export type StepRailProps = {
  steps: ReadonlyArray<Step>;
  /** Override the default step label copy. */
  labels?: Partial<Record<StepName, string>>;
};

const DEFAULT_LABELS: Record<StepName, string> = {
  approve: "Approve USDC",
  transfer: "Transfer",
  burn: "Burn on source chain",
  fetchAttestation: "Confirm attestation",
  mint: "Mint on destination",
};

/**
 * Vertical step rail that mirrors a `Step[]` from the engine or from
 * `deriveReceiptView`. Each step renders a state-coloured dot plus a
 * label; the first `pending` step is marked active (animated pulse).
 */
export function StepRail({ steps, labels }: StepRailProps) {
  const activeIndex = steps.findIndex((s) => s.state === "pending");
  return (
    <ol className="whisk-step-rail" aria-label="Transfer progress">
      {steps.map((step, i) => {
        const isActive = i === activeIndex;
        const label =
          labels?.[step.name] ?? DEFAULT_LABELS[step.name] ?? step.name;
        const cls = cn(
          "whisk-step",
          step.state === "success" && "whisk-step--success",
          step.state === "error" && "whisk-step--error",
          isActive && "whisk-step--active",
        );
        return (
          <li key={`${step.name}-${i}`} className={cls}>
            <span className="whisk-step__dot" aria-hidden>
              {step.state === "success" ? <CheckIcon /> : null}
              {step.state === "error" ? <XIcon /> : null}
            </span>
            <span>
              {label}
              {step.forwarded ? " (forwarder)" : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function CheckIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.5 6.5L5 9L9.5 3.5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 3l6 6M9 3L3 9" />
    </svg>
  );
}
