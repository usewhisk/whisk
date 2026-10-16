"use client";

import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ConfigError,
  type RefundInput,
  type RefundResult,
  type SendListeners,
} from "@usewhisk/core";
import { useEvmAdapter } from "./useEvmAdapter.js";
import { useWhiskEngine } from "./useWhiskEngine.js";

export type UseRefundVariables = RefundInput & {
  listeners?: SendListeners;
};

export type UseRefundResult = {
  /** Fire-and-forget. Errors land on `error`; the result on `data`. */
  refund: (input: UseRefundVariables) => void;
  /** Await-able variant. Resolves to `RefundResult`; rejects on thrown errors. */
  refundAsync: (input: UseRefundVariables) => Promise<RefundResult>;
  /** Latest engine result. Branch on `data.kind` for success vs failure. */
  data: RefundResult | null;
  /** Set when `refundAsync` itself throws (missing adapter, network blowup). */
  error: Error | null;
  /** True while the refund is in flight. */
  isPending: boolean;
  /** Reset the cached result and error. */
  reset: () => void;
};

/**
 * Refund-flavoured mutation hook. Pulls the merchant adapter from the
 * connected EVM wallet, validates the input via the engine, and
 * stamps the Whisk-internal correlation keys on the result.
 *
 * Mirrors wagmi's `useWriteContract` shape — `mutate` /
 * `mutateAsync` / `isPending` / `data` / `error` / `reset` — so the
 * ergonomics match what most integrators already know.
 */
export function useRefund(): UseRefundResult {
  const engine = useWhiskEngine();
  const adapter = useEvmAdapter();

  const mutation = useMutation<RefundResult, Error, UseRefundVariables>({
    mutationFn: ({ listeners, ...input }) => {
      if (!adapter) {
        throw new ConfigError(
          "useRefund: no merchant wallet connected. Open the ConnectModal first.",
        );
      }
      return engine.refund({ ...input, merchantAdapter: adapter }, listeners);
    },
  });

  const refund = useCallback(
    (input: UseRefundVariables) => {
      mutation.mutate(input);
    },
    [mutation],
  );

  const refundAsync = useCallback(
    (input: UseRefundVariables) => mutation.mutateAsync(input),
    [mutation],
  );

  const reset = useCallback(() => {
    mutation.reset();
  }, [mutation]);

  return {
    refund,
    refundAsync,
    data: mutation.data ?? null,
    error: mutation.error ?? null,
    isPending: mutation.isPending,
    reset,
  };
}
