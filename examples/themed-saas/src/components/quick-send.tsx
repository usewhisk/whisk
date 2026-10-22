"use client";

import { WhiskSend } from "@usewhisk/react";
import { TREASURY, type Vendor } from "../data/vendors";
import type { PayoutState } from "../hooks/use-payout";

export type QuickSendProps = {
  state: PayoutState;
  onPaid: (txHash?: string) => void;
  onClear: () => void;
  onReset: () => void;
};

export function QuickSend({ state, onPaid, onClear, onReset }: QuickSendProps) {
  return (
    <aside className="flex flex-col gap-3 rounded-xl border border-line bg-card/60 p-5 backdrop-blur-sm">
      <header className="flex items-center justify-between">
        <h2 className="m-0 font-display text-xl text-text">Quick send</h2>
        <span className="rounded-full bg-foam/15 px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-foam">
          Treasury → vendor
        </span>
      </header>
      <Body state={state} onPaid={onPaid} onClear={onClear} onReset={onReset} />
    </aside>
  );
}

function Body({ state, onPaid, onClear, onReset }: QuickSendProps) {
  if (state.kind === "selected") {
    return (
      <SelectedVendor vendor={state.vendor} onClear={onClear} onPaid={onPaid} />
    );
  }
  if (state.kind === "confirmed") {
    return (
      <Confirmed
        vendor={state.vendor}
        txHash={state.txHash}
        onReset={onReset}
      />
    );
  }
  return <EmptyState />;
}

function SelectedVendor({
  vendor,
  onClear,
  onPaid,
}: {
  vendor: Vendor;
  onClear: () => void;
  onPaid: (tx?: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between rounded-md border border-foam/30 bg-foam/8 p-3">
        <div className="flex flex-col gap-0.5 text-[13px]">
          <span className="text-text">{vendor.name}</span>
          <span className="font-mono text-[11px] text-text-muted">
            {vendor.handle} · {vendor.chain}
          </span>
          <span className="mt-1 font-mono text-[10px] text-foam">
            Locked from vendor profile · fees covered, vendor nets the full
            amount
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-line px-2 py-1 text-[11px] text-text-muted hover:border-line-strong hover:text-text"
        >
          ✕
        </button>
      </div>

      <div className="sp-widget">
        <WhiskSend
          amount={vendor.amount}
          recipient={TREASURY}
          onSuccess={({ finalTxHash }) => onPaid(finalTxHash)}
        />
      </div>
    </div>
  );
}

function Confirmed({
  vendor,
  txHash,
  onReset,
}: {
  vendor: Vendor;
  txHash?: string;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-pos/30 bg-pos/8 p-4">
      <span className="text-[11px] uppercase tracking-wider text-pos">
        Paid · settled
      </span>
      <p className="m-0 text-[15px] text-text">
        {vendor.name} has been funded for this cycle.
      </p>
      {txHash && (
        <a
          href={`https://testnet.arcscan.app/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[12px] text-foam hover:underline"
        >
          {txHash.slice(0, 12)}…{txHash.slice(-6)} ↗
        </a>
      )}
      <button
        type="button"
        onClick={onReset}
        className="self-start rounded-md border border-line-strong px-3 py-1.5 text-[12px] text-text-soft hover:border-foam hover:text-foam"
      >
        Pick another vendor →
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-line-strong p-5 text-[13px] text-text-soft">
      <span className="text-[11px] uppercase tracking-wider text-text-muted">
        Empty state
      </span>
      <p className="m-0">
        Pick a vendor on the left, and the Whisk widget will load with the right
        amount + recipient prefilled.
      </p>
      <span className="font-mono text-[11px] text-text-muted">
        ↖ Click any row in &quot;Scheduled vendors&quot;
      </span>
    </div>
  );
}
