/**
 * Pure derivation of a "receipt" view for an existing Whisk transfer.
 *
 * Used by `<WhiskReceipt>` (drop-in settlement-status widget) and by any
 * caller that has the source-chain tx hash of a transfer and wants to render
 * its lifecycle without re-running the full engine flow.
 *
 * No I/O, no React, no App Kit. The React hook (`useReceipt`) handles the
 * Iris polling and feeds the latest result through this function.
 */
import type { Chain } from "../types/chain.js";
import type { Step } from "../types/step.js";
import { getChain } from "@usewhisk/cctp";
import { explorerTxUrl } from "../chains/index.js";
import type { IrisStatus } from "./iris.js";

/**
 * High-level lifecycle stages a Whisk transfer can be in, derived from the
 * combination of Iris attestation status + whether a destination tx is known.
 *
 * - `"submitted"`: source tx submitted; Iris hasn't seen it yet.
 * - `"awaiting_attestation"` — burn confirmed, waiting on Circle Iris to
 *   sign the cross-chain message.
 * - `"attested"` — attestation complete, but no destination tx observed yet
 *   (either the mint is in flight or the caller has not yet supplied the
 *   destination tx hash).
 * - `"settled"` — destination tx hash present (or same-chain transfer
 *   submitted with no further stages required).
 * - `"failed"`: the caller passed `hasError`.
 */
export type ReceiptStage =
  | "submitted"
  | "awaiting_attestation"
  | "attested"
  | "settled"
  | "failed";

export type ReceiptInput = {
  sourceChain: Chain;
  sourceTxHash: string;
  /** Destination chain. For same-chain sends, equal to `sourceChain`. */
  destinationChain: Chain;
  /** Mint tx hash on the destination chain, if known. */
  destinationTxHash?: string;
  /**
   * Latest Iris attestation status, if known. Pass `undefined` while the
   * first request is still pending.
   */
  irisStatus?: IrisStatus;
  /**
   * Set to `true` to force the `"failed"` stage — useful when the caller
   * already saw a `SendFailure` from the engine.
   */
  hasError?: boolean;
};

export type ReceiptView = {
  stage: ReceiptStage;
  /**
   * Ordered step list suitable for `<StepRail>`. For same-chain sends the
   * list has a single `transfer` step. For CCTP bridges it has
   * `burn → fetchAttestation → mint`.
   */
  steps: Step[];
  /** `true` when source ≠ destination (CCTP path). */
  isCrossChain: boolean;
  sourceExplorerUrl: string;
  destinationExplorerUrl?: string;
};

/**
 * Map an input snapshot to a {@link ReceiptView}. Pure — call it again with
 * a fresher `irisStatus` to update the rendered state.
 */
export function deriveReceiptView(input: ReceiptInput): ReceiptView {
  const { sourceChain, sourceTxHash, destinationChain, destinationTxHash } =
    input;

  const sourceExplorerUrl = explorerTxUrl(sourceChain, sourceTxHash);
  const destinationExplorerUrl = destinationTxHash
    ? explorerTxUrl(destinationChain, destinationTxHash)
    : undefined;

  const isCrossChain = sourceChain !== destinationChain;

  // Same-chain transfer: there's no CCTP burn / Iris attestation / mint —
  // the source tx IS the settlement.
  if (!isCrossChain) {
    const stage: ReceiptStage = input.hasError ? "failed" : "settled";
    return {
      stage,
      isCrossChain: false,
      sourceExplorerUrl,
      destinationExplorerUrl,
      steps: [
        {
          name: "transfer",
          state: input.hasError ? "error" : "success",
          txHash: sourceTxHash,
          explorerUrl: sourceExplorerUrl,
        },
      ],
    };
  }

  // Cross-chain transfer: derive stage from Iris + destinationTxHash.
  if (input.hasError) {
    return {
      stage: "failed",
      isCrossChain: true,
      sourceExplorerUrl,
      destinationExplorerUrl,
      steps: buildCrossChainSteps({
        sourceTxHash,
        sourceExplorerUrl,
        destinationTxHash,
        destinationExplorerUrl,
        burnState: "success",
        attestationState: "error",
        mintState: "noop",
      }),
    };
  }

  const status = input.irisStatus;

  // Iris reported a hard failure — render error.
  // We have a destination tx — settled regardless of Iris state.
  if (destinationTxHash) {
    return {
      stage: "settled",
      isCrossChain: true,
      sourceExplorerUrl,
      destinationExplorerUrl,
      steps: buildCrossChainSteps({
        sourceTxHash,
        sourceExplorerUrl,
        destinationTxHash,
        destinationExplorerUrl,
        burnState: "success",
        attestationState: "success",
        mintState: "success",
      }),
    };
  }

  // Attestation complete but no destination tx — mint is either in flight or
  // the merchant hasn't supplied the hash yet.
  if (status === "complete") {
    return {
      stage: "attested",
      isCrossChain: true,
      sourceExplorerUrl,
      destinationExplorerUrl,
      steps: buildCrossChainSteps({
        sourceTxHash,
        sourceExplorerUrl,
        destinationTxHash,
        destinationExplorerUrl,
        burnState: "success",
        attestationState: "success",
        mintState: "pending",
      }),
    };
  }

  // Iris is actively confirming.
  if (status === "pending_confirmations") {
    return {
      stage: "awaiting_attestation",
      isCrossChain: true,
      sourceExplorerUrl,
      destinationExplorerUrl,
      steps: buildCrossChainSteps({
        sourceTxHash,
        sourceExplorerUrl,
        destinationTxHash,
        destinationExplorerUrl,
        burnState: "success",
        attestationState: "pending",
        mintState: "noop",
      }),
    };
  }

  // No Iris status yet: the first render, or Iris has not seen the burn.
  return {
    stage: "submitted",
    isCrossChain: true,
    sourceExplorerUrl,
    destinationExplorerUrl,
    steps: buildCrossChainSteps({
      sourceTxHash,
      sourceExplorerUrl,
      destinationTxHash,
      destinationExplorerUrl,
      burnState: "pending",
      attestationState: "noop",
      mintState: "noop",
    }),
  };
}

function buildCrossChainSteps(args: {
  sourceTxHash: string;
  sourceExplorerUrl: string;
  destinationTxHash?: string;
  destinationExplorerUrl?: string;
  burnState: Step["state"];
  attestationState: Step["state"];
  mintState: Step["state"];
}): Step[] {
  return [
    {
      name: "burn",
      state: args.burnState,
      txHash: args.sourceTxHash,
      explorerUrl: args.sourceExplorerUrl,
    },
    {
      name: "fetchAttestation",
      state: args.attestationState,
    },
    {
      name: "mint",
      state: args.mintState,
      ...(args.destinationTxHash
        ? {
            txHash: args.destinationTxHash,
            explorerUrl: args.destinationExplorerUrl,
          }
        : {}),
    },
  ];
}

/**
 * Human-readable label for a {@link ReceiptStage}. UI-layer code is free to
 * override these for translation; this is the default English copy.
 */
export const RECEIPT_STAGE_LABELS: Record<ReceiptStage, string> = {
  submitted: "Submitted",
  awaiting_attestation: "Confirming on source chain",
  attested: "Minting on destination",
  settled: "Settled",
  failed: "Failed",
};

/** Friendly secondary copy paired with the stage label. */
export const RECEIPT_STAGE_HELP: Record<ReceiptStage, string> = {
  submitted: "We're waiting for the burn to be picked up.",
  awaiting_attestation:
    "Circle is signing the cross-chain message. This usually takes 30–90s.",
  attested: "Attestation ready. The destination mint will land shortly.",
  settled: "Funds have landed on the destination chain.",
  failed: "Something went wrong. Check the source tx for the full revert.",
};

/** Chain labels for the receipt UI. */
export function describeReceiptChains(view: ReceiptView, input: ReceiptInput) {
  return {
    sourceLabel: getChain(input.sourceChain).label,
    destinationLabel: getChain(input.destinationChain).label,
    isCrossChain: view.isCrossChain,
  };
}
