"use client";

import { WhiskSend } from "@usewhisk/react";
import type { InvoiceQuery } from "../lib/types";
import { explorerUrl, shortTxHash } from "../lib/order";

type ValidInvoice = Extract<InvoiceQuery, { valid: true }>;

export type PayAsideProps = {
  invoice: ValidInvoice;
  txHash: string | null;
  onPaid: (txHash?: string) => void;
};

export function PayAside({ invoice, txHash, onPaid }: PayAsideProps) {
  return (
    <aside className="flex flex-col gap-4 self-start rounded-2xl border border-line bg-paper p-5 sm:p-6 lg:sticky lg:top-5">
      {txHash !== null ? (
        <PaidConfirmation amount={invoice.amount} txHash={txHash} />
      ) : (
        <PayPanel invoice={invoice} onPaid={onPaid} />
      )}
    </aside>
  );
}

function PayPanel({
  invoice,
  onPaid,
}: {
  invoice: ValidInvoice;
  onPaid: (txHash?: string) => void;
}) {
  return (
    <>
      <header>
        <p className="m-0 text-[11px] uppercase tracking-[0.18em] text-coral">
          Pay this invoice
        </p>
        <h2 className="m-0 mt-1 font-display text-xl text-ink">
          Settle in seconds with USDC.
        </h2>
        <p className="m-0 mt-1 text-[12px] text-ink-muted">
          Amount, recipient, and chain are pinned to this invoice. Bridge fees
          are added to your total, so Studio Hibiscus receives the full amount.
        </p>
      </header>

      <div className="sh-widget">
        <WhiskSend
          amount={invoice.amount}
          recipient={invoice.to}
          sourceChain={invoice.chain}
          destinationChain={invoice.chain}
          onSuccess={({ finalTxHash }) => onPaid(finalTxHash)}
        />
      </div>

      <p className="m-0 mt-1 text-center text-[11px] uppercase tracking-[0.14em] text-ink-muted">
        Powered by Whisk · Locked from URL
      </p>
    </>
  );
}

function PaidConfirmation({
  amount,
  txHash,
}: {
  amount: string;
  txHash: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-sage text-[1.4rem] text-paper"
      >
        ✓
      </span>
      <span className="text-[11px] uppercase tracking-[0.18em] text-sage-deep">
        Paid · settled
      </span>
      <h2 className="m-0 font-display text-xl text-ink">
        Thank you for the prompt payment.
      </h2>
      <p className="m-0 text-[13px] text-ink-soft">
        ${amount} USDC received. A receipt is on its way to your email.
      </p>
      {txHash && (
        <a
          href={explorerUrl(txHash)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[12px] text-coral underline-offset-2 hover:underline"
        >
          {shortTxHash(txHash)} ↗
        </a>
      )}
    </div>
  );
}
