/**
 * Iris API response shapes.
 */
import type { CctpDomain } from "../chains/types.js";

/** Fast Transfer attests after a block or two, before hard finality. */
export const FINALITY_FAST = 1000 as const;
/** Standard Transfer attests after hard finality. */
export const FINALITY_STANDARD = 2000 as const;
export type FinalityThreshold = typeof FINALITY_FAST | typeof FINALITY_STANDARD;

export type TransferSpeed = "fast" | "standard";

/**
 * Forwarder fee levels returned per finality level, in USDC subunits.
 * Circle recommends `med` or higher.
 */
export type ForwarderFeeTier = {
  low: bigint;
  med: bigint;
  high: bigint;
};

/**
 * A Fast or Standard row of the `/v2/burn/USDC/fees/{src}/{dst}` response, parsed.
 *
 * `minimumFee` is in hundredths of a basis point: Iris's `1.3` is `130n`.
 * `forwardFee` is present only when `?forward=true` is set on the request.
 */
export type BurnFeeTier = {
  finalityThreshold: FinalityThreshold;
  minimumFee: bigint;
  forwardFee?: ForwarderFeeTier;
};

/**
 * Iris attestation lifecycle status.
 */
/** Iris never reports a failed attestation; a slow one stays pending. */
export type IrisAttestationStatus = "pending_confirmations" | "complete";

/** Why a message is slower than asked. None of these is a failure. */
export type IrisDelayReason =
  | "insufficient_fee"
  | "amount_above_max"
  | "insufficient_allowance_available";

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
  delayReason?: IrisDelayReason | null;
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
