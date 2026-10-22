"use client";

import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import {
  ConfigError,
  type Chain,
  type EvmAdapter,
  type Quote,
  type QuoteParams,
  type ResolvedRecipient,
  type SendListeners,
  type SendParams,
  type SendResult,
  type WhiskEngine,
} from "@usewhisk/core";
import { useEvmAdapter } from "./useEvmAdapter.js";
import { useWhiskEngine } from "./useWhiskEngine.js";

export type UseWhiskResult = {
  /** Engine constructed by `<WhiskProvider>`. */
  engine: WhiskEngine;
  /** `null` until the user connects an EVM wallet. */
  adapter: EvmAdapter | null;
  /** Connected account address. */
  address: `0x${string}` | undefined;
  /** True when an EVM wallet is connected. */
  isConnected: boolean;

  /** Resolve an address-or-name input into a `ResolvedRecipient`. */
  resolve: (input: string, chain: Chain) => Promise<ResolvedRecipient>;

  /** Build a quote for the current adapter. Throws if not connected. */
  quote: (params: Omit<QuoteParams, "adapter">) => Promise<Quote>;

  /** Execute a send / bridge. Throws if not connected. */
  send: (
    params: Omit<SendParams, "adapter">,
    listeners?: SendListeners,
  ) => Promise<SendResult>;

  /** True while a send is in flight. */
  isSending: boolean;
  /** Latest engine result. Branch on `kind` for success or failure. */
  lastResult: SendResult | null;
  /** Set when `send` throws, such as with no wallet connected or a network failure. */
  sendError: Error | null;
  /** Clear the latest result and any error. */
  reset: () => void;
};

/**
 * The engine, the connected EVM wallet, and send state, for custom widgets
 * that do not use `<WhiskSend>`. Refunds go through `useRefund`.
 */
export function useWhisk(): UseWhiskResult {
  const engine = useWhiskEngine();
  const adapter = useEvmAdapter();
  const { address, isConnected } = useAccount();

  const sendMutation = useMutation<
    SendResult,
    Error,
    {
      params: Omit<SendParams, "adapter">;
      listeners: SendListeners | undefined;
    }
  >({
    mutationFn: ({ params, listeners }) => {
      if (!adapter) {
        throw new ConfigError(
          "useWhisk.send: no EVM wallet connected. Open the ConnectModal first.",
        );
      }
      return engine.send({ ...params, adapter }, listeners);
    },
  });

  const resolve = useCallback(
    (input: string, chain: Chain) => engine.resolve(input, chain),
    [engine],
  );

  const quote = useCallback(
    async (params: Omit<QuoteParams, "adapter">): Promise<Quote> => {
      if (!adapter) {
        throw new ConfigError(
          "useWhisk.quote: no EVM wallet connected. Open the ConnectModal first.",
        );
      }
      return engine.quote({ ...params, adapter });
    },
    [adapter, engine],
  );

  const send = useCallback(
    (
      params: Omit<SendParams, "adapter">,
      listeners?: SendListeners,
    ): Promise<SendResult> => sendMutation.mutateAsync({ params, listeners }),
    [sendMutation],
  );

  const reset = useCallback(() => {
    sendMutation.reset();
  }, [sendMutation]);

  return {
    engine,
    adapter,
    address,
    isConnected,
    resolve,
    quote,
    send,
    isSending: sendMutation.isPending,
    lastResult: sendMutation.data ?? null,
    sendError: sendMutation.error ?? null,
    reset,
  };
}
