"use client";

import { useInvoiceLink } from "../../hooks/use-invoice-link";
import { InvoiceForm } from "../../components/invoice-form";
import { LinkPreview } from "../../components/link-preview";

export function CreateForm() {
  const link = useInvoiceLink();

  return (
    <article className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
      <ComposerHeader />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <InvoiceForm draft={link.draft} set={link.set} />
        <LinkPreview
          isValid={link.isValid}
          fullUrl={link.fullUrl}
          path={link.path}
          copied={link.copied}
          onCopy={link.copy}
        />
      </div>
    </article>
  );
}

function ComposerHeader() {
  return (
    <header className="flex flex-col gap-2">
      <p className="text-[11px] uppercase tracking-[0.2em] text-coral">
        Studio Hibiscus · Compose
      </p>
      <h1 className="m-0 font-display text-[2.6rem] leading-[1.05] tracking-tight text-ink sm:text-[3.4rem]">
        One link.{" "}
        <em className="font-display italic text-coral-deep">
          Paid in minutes.
        </em>
      </h1>
      <p className="m-0 max-w-2xl text-[16px] leading-relaxed text-ink-soft">
        No SDK on the customer's side. Drop in the address, amount, and chain —
        share the URL. Whisk pre-fills and pins the payment for them.
      </p>
    </header>
  );
}
