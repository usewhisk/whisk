import { useCallback, useMemo, useState } from "react";
import { PAYEES, type Payee } from "../data/payees";

export type BatchStep = "review" | "paying" | "done";

export type BatchSummary = {
  total: number;
  paid: number;
  doneCount: number;
  /** Index into `included`. */
  activeIdx: number;
  /** Percent from 0 to 100, counting the payment in flight. */
  pct: number;
};

/**
 * `<WhiskSend onSuccess>` calls `advance` to move to the next payee.
 * Excluded payees never enter `included`, so the run only walks payees still in it.
 */
export function useBatch() {
  const [step, setStep] = useState<BatchStep>("review");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [activeIdx, setActiveIdx] = useState(0);
  const [done, setDone] = useState<string[]>([]);

  const included = useMemo<Payee[]>(
    () => PAYEES.filter((p) => !excluded.has(p.id)),
    [excluded],
  );

  const summary = useMemo<BatchSummary>(() => {
    const total = included.reduce((s, p) => s + p.amount, 0);
    const paid = included
      .slice(0, done.length)
      .reduce((s, p) => s + p.amount, 0);
    const pct =
      included.length === 0 ? 0 : ((done.length + 1) / included.length) * 100;
    return { total, paid, doneCount: done.length, activeIdx, pct };
  }, [included, done.length, activeIdx]);

  const currentPayee: Payee | undefined = included[activeIdx];

  const toggle = useCallback((id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startBatch = useCallback(() => {
    setActiveIdx(0);
    setDone([]);
    setStep("paying");
  }, []);

  const advance = useCallback(() => {
    if (!currentPayee) return;
    setDone((prev) => [...prev, currentPayee.id]);
    setActiveIdx((prev) => {
      const next = prev + 1;
      if (next >= included.length) {
        setStep("done");
        return prev;
      }
      return next;
    });
  }, [currentPayee, included.length]);

  const reset = useCallback(() => {
    setStep("review");
    setExcluded(new Set());
    setDone([]);
    setActiveIdx(0);
  }, []);

  return {
    step,
    included,
    excluded,
    currentPayee,
    summary,
    toggle,
    startBatch,
    advance,
    reset,
  };
}
