"use client";

import { chainsByNetwork, type Chain } from "@usewhisk/react";
import type { InvoiceDraft } from "../hooks/use-invoice-link";

const CHAIN_OPTIONS = chainsByNetwork("testnet");

export type InvoiceFormProps = {
  draft: InvoiceDraft;
  set: <K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) => void;
};

export function InvoiceForm({ draft, set }: InvoiceFormProps) {
  return (
    <section className="rounded-2xl border border-line bg-paper p-6 shadow-[0_1px_2px_rgba(42,32,24,0.04),0_14px_30px_-18px_rgba(42,32,24,0.12)]">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="m-0 font-display text-xl text-ink">Invoice details</h2>
        <span className="rounded-full border border-line bg-cream-2/40 px-2.5 py-1 text-[11px] uppercase tracking-wider text-ink-muted">
          Step 1 of 2
        </span>
      </header>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <Field label="Recipient address" hint="Where the USDC lands.">
          <input
            type="text"
            value={draft.to}
            onChange={(e) => set("to", e.target.value)}
            placeholder="0x5B8ecaB7096F8aBED873D246629ef9f05f467605"
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-[13px] text-ink outline-none focus:border-coral focus:ring-1 focus:ring-coral/20"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Amount (USDC)">
            <input
              type="number"
              value={draft.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="2400.00"
              step="0.01"
              inputMode="decimal"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-[15px] text-ink outline-none focus:border-coral focus:ring-1 focus:ring-coral/20"
            />
          </Field>
          <Field label="Settle on">
            <select
              value={draft.chain}
              onChange={(e) => set("chain", e.target.value as Chain)}
              className="w-full appearance-none rounded-lg border border-line bg-paper px-3 py-2.5 text-[15px] text-ink outline-none focus:border-coral focus:ring-1 focus:ring-coral/20"
            >
              {CHAIN_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Memo (optional)" hint="Shown to the customer.">
          <input
            type="text"
            value={draft.memo}
            onChange={(e) => set("memo", e.target.value)}
            placeholder="Brand identity — final invoice"
            maxLength={120}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-[15px] text-ink outline-none focus:border-coral focus:ring-1 focus:ring-coral/20"
          />
        </Field>
      </form>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-ink-muted">{hint}</span>}
    </label>
  );
}
