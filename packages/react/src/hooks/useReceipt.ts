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
  /** Optional pre-known destination tx hash (stops polling). */
  destinationTxHash?: string;
  /** Force the failed stage — useful when the merchant already saw a `SendFailure`. */
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
  /** Set if Iris polling throws (network error etc.). */
  error: Error | null;
};

const TERMINAL: ReadonlyArray<IrisStatus> = ["complete", "failed"];

/**
 * Poll Iris for the attestation lifecycle of a single transfer and
 * project the result through {@link deriveReceiptView}.
 *
 *   - Same-chain transfers don't poll Iris — they settle the moment
 *     the source tx is observed, so the hook returns a `settled` view
 *     immediately.
 *   - Cross-chain transfers poll until the attestation reaches a
 *     terminal state (`complete` / `failed`) or the timeout elapses.
 *   - Once the merchant supplies `destinationTxHash`, polling stops
 *     even if Iris hasn't reported `complete` yet.
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

  // Anchor the polling deadline to the source-tx hash. New hash → new
  // deadline; same hash → preserved across re-renders.
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
