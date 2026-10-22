/**
 * The status of a past transfer from its source-chain tx hash, without
 * running the engine. No I/O: `useReceipt` polls Iris and feeds each result
 * through here.
 */
import type { Chain } from "../types/chain.js";
import type { Step } from "../types/step.js";
import { getChain } from "@usewhisk/cctp";
import { explorerTxUrl } from "../chains/index.js";
import type { IrisStatus } from "./iris.js";

/**
 * Derived from the Iris status and whether a destination tx is known.
 *
 * - `"submitted"`: source tx sent; Iris has not seen it yet.
 * - `"awaiting_attestation"`: Iris is waiting on source-chain confirmations
 *   before signing the message.
 * - `"attested"`: attestation ready, no destination tx known yet. The mint
 *   may be in flight, or the caller has not passed its hash.
 * - `"settled"`: destination tx hash present, or a same-chain transfer.
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
  /** Equal to `sourceChain` for a same-chain send. */
  destinationChain: Chain;
  destinationTxHash?: string;
  /** `undefined` until the first Iris response arrives. */
  irisStatus?: IrisStatus;
  /** Forces the `"failed"` stage, for a caller that already saw a `SendFailure`. */
  hasError?: boolean;
};

export type ReceiptView = {
  stage: ReceiptStage;
  /**
   * A single `transfer` step for a same-chain send, otherwise `burn`,
   * `fetchAttestation`, `mint`.
   */
  steps: Step[];
  isCrossChain: boolean;
  sourceExplorerUrl: string;
  destinationExplorerUrl?: string;
};

/** Pure: call it again with a fresher `irisStatus` to update the view. */
export function deriveReceiptView(input: ReceiptInput): ReceiptView {
  const { sourceChain, sourceTxHash, destinationChain, destinationTxHash } =
    input;

  const sourceExplorerUrl = explorerTxUrl(sourceChain, sourceTxHash);
  const destinationExplorerUrl = destinationTxHash
    ? explorerTxUrl(destinationChain, destinationTxHash)
    : undefined;

  const isCrossChain = sourceChain !== destinationChain;

  // A same-chain transfer settles in the source tx itself.
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

  // A known mint tx means settled, whatever Iris last said.
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

/** Default English labels. Override them in the UI to translate. */
export const RECEIPT_STAGE_LABELS: Record<ReceiptStage, string> = {
  submitted: "Submitted",
  awaiting_attestation: "Confirming on source chain",
  attested: "Minting on destination",
  settled: "Settled",
  failed: "Failed",
};

export const RECEIPT_STAGE_HELP: Record<ReceiptStage, string> = {
  submitted: "We're waiting for the burn to be picked up.",
  awaiting_attestation:
    "Circle is signing the cross-chain message. This usually takes 30–90s.",
  attested: "Attestation ready. The destination mint will land shortly.",
  settled: "Funds have landed on the destination chain.",
  failed: "Something went wrong. Check the source tx for the full revert.",
};

export function describeReceiptChains(view: ReceiptView, input: ReceiptInput) {
  return {
    sourceLabel: getChain(input.sourceChain).label,
    destinationLabel: getChain(input.destinationChain).label,
    isCrossChain: view.isCrossChain,
  };
}
