"use client";

import { useState } from "react";
import { useInvoiceParams } from "../hooks/use-invoice-params";
import { InvoiceCard } from "../components/invoice-card";
import { PayAside } from "../components/pay-aside";
import { EmptyState } from "../components/empty-state";

export function ExampleInvoice() {
  const invoice = useInvoiceParams();
  const [txHash, setTxHash] = useState<string | null>(null);

  if (!invoice.valid) {
    return <EmptyState />;
  }

  return (
    <article
      className="mx-auto grid w-full max-w-[1100px] gap-5 lg:grid-cols-[1.4fr_1fr]"
      style={{ animation: "sh-rise 320ms ease-out" }}
    >
      <InvoiceCard invoice={invoice} paid={txHash !== null} />
      <PayAside
        invoice={invoice}
        txHash={txHash}
        onPaid={(hash) => setTxHash(hash ?? "")}
      />
    </article>
  );
}
