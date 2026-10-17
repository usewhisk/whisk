"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { getChain, isChainId } from "@usewhisk/react";
import type { InvoiceQuery } from "../lib/types";

/**
 * Read the invoice fields off the URL query string and resolve the chain
 * code to a registered network. Returns a discriminated union so callers
 * can render the empty-state branch without runtime guards.
 *
 * Lives in this hook (not the page) so it can be unit-tested by feeding in
 * a stub `useSearchParams` — and so the customer view stays pure UI.
 */
export function useInvoiceParams(): InvoiceQuery {
  const params = useSearchParams();

  return useMemo(() => {
    const to = params.get("to")?.trim() ?? "";
    const amount = params.get("amount")?.trim() ?? "";
    const chainParam = params.get("chain")?.trim() ?? "";
    const memo = params.get("memo")?.trim() ?? "";

    if (!to && !amount && !chainParam) {
      return { valid: false, reason: "missing" };
    }
    if (!to) return { valid: false, reason: "missing-to" };
    if (!amount) return { valid: false, reason: "missing-amount" };

    if (!isChainId(chainParam)) {
      return { valid: false, reason: "unknown-chain" };
    }
    const resolved = getChain(chainParam);

    return {
      valid: true,
      to,
      amount,
      chain: chainParam,
      chainLabel: resolved.label,
      memo,
    };
  }, [params]);
}
