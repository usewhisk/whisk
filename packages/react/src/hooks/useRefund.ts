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
  /** Set when the refund throws, such as with no wallet connected or a network failure. */
  error: Error | null;
  /** True while the refund is in flight. */
  isPending: boolean;
  /** Reset the cached result and error. */
  reset: () => void;
};

/** Refunds from the connected EVM wallet, which acts as the merchant. */
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
