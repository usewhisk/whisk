"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  deriveReceiptView,
  fetchAttestationOnce,
  type Chain,
  type IrisMessage,
  type IrisStatus,
  type ReceiptView,
} from "@usewhisk/core";

export type UseReceiptInput = {
  sourceChain: Chain;
  sourceTxHash: string | undefined;
  destinationChain: Chain;
  /** Destination tx hash, when already known. Polling stops once it is set. */
  destinationTxHash?: string;
  /** Force the failed stage, such as when the caller already has a `SendFailure`. */
  hasError?: boolean;
  /** Iris poll interval in ms. Default 3000. */
  pollIntervalMs?: number;
  /** Stop polling after this many ms. Default 10 minutes. */
  pollTimeoutMs?: number;
};

export type UseReceiptResult = {
  view: ReceiptView | null;
  irisStatus: IrisStatus | undefined;
  message: IrisMessage | null;
  /** True while waiting for the first Iris poll. */
  isLoading: boolean;
  /** Set when an Iris poll throws, such as on a network error. */
  error: Error | null;
};

const TERMINAL: ReadonlyArray<IrisStatus> = ["complete"];

/**
 * Polls Iris for one transfer and returns it as a {@link deriveReceiptView}.
 * A same-chain transfer never polls, since the source tx is the settlement.
 * A cross-chain one polls until Iris reports `complete`, the timeout passes,
 * or `destinationTxHash` is given.
 */
export function useReceipt(input: UseReceiptInput): UseReceiptResult {
  const {
    sourceChain,
    sourceTxHash,
    destinationChain,
    destinationTxHash,
    hasError,
    pollIntervalMs = 3000,
    pollTimeoutMs = 10 * 60 * 1000,
  } = input;

  const enabled =
    !!sourceTxHash &&
    sourceChain !== destinationChain &&
    !destinationTxHash &&
    !hasError;

  // The timeout restarts only when the source tx changes, not on re-render.
  const deadlineRef = useRef<{ key: string; startedAt: number } | null>(null);
  const key = `${sourceChain}:${sourceTxHash ?? ""}`;
  if (!deadlineRef.current || deadlineRef.current.key !== key) {
    deadlineRef.current = { key, startedAt: Date.now() };
  }
  const startedAt = deadlineRef.current.startedAt;

  const query = useQuery<IrisMessage>({
    queryKey: ["whisk-receipt", sourceChain, sourceTxHash],
    enabled,
    refetchInterval: (q) => {
      if (!enabled) return false;
      if (Date.now() - startedAt > pollTimeoutMs) return false;
      const data = q.state.data;
      if (data && TERMINAL.includes(data.status)) return false;
      return pollIntervalMs;
    },
    queryFn: () => fetchAttestationOnce(sourceChain, sourceTxHash as string),
  });

  const message = query.data ?? null;
  const irisStatus = message?.status;

  const view = sourceTxHash
    ? deriveReceiptView({
        sourceChain,
        sourceTxHash,
        destinationChain,
        ...(destinationTxHash && { destinationTxHash }),
        ...(irisStatus && { irisStatus }),
        ...(hasError && { hasError: true }),
      })
    : null;

  return {
    view,
    irisStatus,
    message,
    isLoading: query.isLoading && enabled,
    error: query.error ?? null,
  };
}
