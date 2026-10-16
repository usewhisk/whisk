/**
 * Lifecycle step names emitted by the engine.
 *
 *   approve            ERC-20 approval to the TokenMessenger (bridge only)
 *   transfer           Same-chain USDC transfer
 *   burn               Source-chain `depositForBurnWithHook`
 *   fetchAttestation   Waiting for Iris attestation
 *   mint               Destination-chain `receiveMessage` (or Forwarder)
 */
export type StepName =
  | "approve"
  | "transfer"
  | "burn"
  | "fetchAttestation"
  | "mint";

export type StepState = "pending" | "success" | "error" | "noop";

export type Step = {
  name: StepName;
  state: StepState;
  txHash?: string;
  explorerUrl?: string;
  errorMessage?: string;
  errorCategory?: import("../errors/errors.js").WhiskErrorCategory;
  /** Step executed via Circle's Forwarder relay (mint steps only). */
  forwarded?: boolean;
};
