"use client";

import { useCallback, useMemo, useState } from "react";
import type { Chain } from "@usewhisk/react";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export type InvoiceDraft = {
  to: string;
  amount: string;
  chain: Chain;
  memo: string;
};

export function useInvoiceLink(initial: Partial<InvoiceDraft> = {}) {
  const [draft, setDraft] = useState<InvoiceDraft>({
    to: initial.to ?? "",
    amount: initial.amount ?? "",
    chain: initial.chain ?? ("Arc_Testnet" as Chain),
    memo: initial.memo ?? "",
  });
  const [copied, setCopied] = useState(false);

  const set = useCallback(
    <K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const isValid = useMemo(
    () => EVM_ADDRESS.test(draft.to.trim()) && parseFloat(draft.amount) > 0,
    [draft.to, draft.amount],
  );

  const path = useMemo(() => {
    if (!isValid) return null;
    const search = new URLSearchParams();
    search.set("to", draft.to.trim());
    search.set("amount", draft.amount.trim());
    search.set("chain", draft.chain);
    if (draft.memo.trim()) search.set("memo", draft.memo.trim());
    return `/?${search.toString()}`;
  }, [isValid, draft]);

  const fullUrl = useMemo(() => {
    if (!path) return null;
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }, [path]);

  const copy = useCallback(async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* Clipboard access can be blocked; the URL stays on screen. */
    }
  }, [fullUrl]);

  return { draft, set, isValid, path, fullUrl, copied, copy };
}
