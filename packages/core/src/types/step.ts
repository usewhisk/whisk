/**
 * Lifecycle step names emitted by the engine.
 *
 *   approve            ERC-20 approval for the burn (`noop` where none is needed)
 *   transfer           Same-chain USDC transfer
 *   burn               CCTP burn on the source chain
 *   fetchAttestation   Waiting for the Iris attestation
 *   mint               Destination-chain `receiveMessage`, or Circle's Forwarder
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
