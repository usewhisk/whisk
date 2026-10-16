/**
 * Iris API response shapes.
 */
import type { CctpDomain } from "../chains/types.js";

/**
 * Finality threshold value used by Whisk. CCTP V2 also defines a
 * Standard tier (`2000`, 13–19 min); Whisk does not support it.
 * Every bridge ships as a Fast Transfer.
 */
export const FINALITY_FAST = 1000 as const;
export type FinalityThreshold = typeof FINALITY_FAST;

/**
 * Forwarder fee tiers returned per finality level.
 *
 * Higher tier = more priority gas budget on the destination chain.
 * Circle recommends `med` as the default, `high` for safety buffer.
 * All values are USDC subunits (6 decimals).
 */
export type ForwarderFeeTier = {
  low: number;
  med: number;
  high: number;
};

/**
 * Single row of the `/v2/burn/USDC/fees/{src}/{dst}?forward=true` response.
 *
 * `minimumFee` is the CCTP protocol fee rate in basis points × 100
 * (Iris scales by 100 to preserve 0.01 bps precision). Apply via
 * `(amount * minimumFee) / 1_000_000n` for subunits.
 *
 * `forwardFee` is present only when `?forward=true` is set on the
 * request.
 */
export type BurnFeeTier = {
  finalityThreshold: FinalityThreshold;
  minimumFee: number;
  forwardFee?: ForwarderFeeTier;
};

/**
 * Iris attestation lifecycle status.
 */
export type IrisAttestationStatus =
  | "pending_confirmations"
  | "complete"
  | "failed";

/**
 * Circle Orbit forwarder lifecycle status. Present only when the burn
 * was triggered with the forwarder hookData.
 *
 * - `PENDING` — relayer is processing.
 * - `CONFIRMED` — relayer submitted the mint, waiting on finality.
 * - `COMPLETE` — mint finalized.
 * - `FAILED` — relayer rejected; fall back to manual mint.
 */
export type ForwardState = "PENDING" | "CONFIRMED" | "COMPLETE" | "FAILED";

/**
 * Single message returned by `/v2/messages/{srcDomain}`.
 */
export type IrisMessage = {
  /** Raw 0x-prefixed CCTP message bytes; pass to receiveMessage. */
  message: `0x${string}`;
  /** Raw 0x-prefixed attestation bytes; pass to receiveMessage. */
  attestation: `0x${string}`;
  /** Decimal string. */
  eventNonce: string;
  status: IrisAttestationStatus;
  cctpVersion: 2;
  /** Present when burn included forwarder hookData. */
  forwardState?: ForwardState | null;
  /** Destination tx hash when forwardState is CONFIRMED or COMPLETE. */
  forwardTxHash?: string | null;
  /** Optional human-readable delay reason. */
  delayReason?: string | null;
  /** Decoded message and message body, if Iris can decode them. */
  decodedMessage?: {
    sourceDomain: string;
    destinationDomain: string;
    nonce: `0x${string}`;
    sender: string | null;
    recipient: string | null;
    destinationCaller: string | null;
    minFinalityThreshold: string;
    finalityThresholdExecuted: string;
    messageBody: `0x${string}`;
    decodedMessageBody?: {
      burnToken: string | null;
      mintRecipient: string | null;
      amount: string;
      messageSender: string | null;
      maxFee: string;
      feeExecuted: string;
      expirationBlock: string;
      hookData: `0x${string}` | null;
    };
  };
};

export type IrisMessagesResponse = {
  messages: IrisMessage[];
};

/**
 * Filters for getMessages. Pass at least one of `transactionHash` or `nonce`.
 */
export type GetMessagesQuery = {
  sourceDomain: CctpDomain;
  transactionHash?: string;
  nonce?: string;
};
