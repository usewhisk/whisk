"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { getChain, isChainId } from "@usewhisk/react";
import type { InvoiceQuery } from "../lib/types";

/**
 * The link is untrusted input. Only a chain id Whisk knows passes, so a
 * tampered `chain` falls through to the empty state instead of the widget.
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
