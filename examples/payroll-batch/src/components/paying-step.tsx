import { WhiskSend } from "@usewhisk/react";
import { STUDIO_TREASURY, type Payee } from "../data/payees";
import type { BatchSummary } from "../hooks/use-batch";
import { Steps } from "./steps";

export type PayingStepProps = {
  included: Payee[];
  currentPayee: Payee;
  summary: BatchSummary;
  onPaid: () => void;
  onSkip: () => void;
};

export function PayingStep({
  included,
  currentPayee,
  summary,
  onPaid,
  onSkip,
}: PayingStepProps) {
  return (
    <section className="flex flex-col gap-6">
      <Header currentName={currentPayee.name} />
      <Steps active={2} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <RunProgress
          included={included}
          summary={summary}
          currentAmount={currentPayee.amount}
        />
        <ActivePayeeCard payee={currentPayee} onPaid={onPaid} onSkip={onSkip} />
      </div>
    </section>
  );
}

function Header({ currentName }: { currentName: string }) {
  return (
    <header className="flex flex-col gap-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-burgundy">
        Step 2 of 3 · Dispatching
      </p>
      <h1 className="m-0 font-display text-[2.2rem] leading-[1.05] tracking-tight text-claret-deep sm:text-[2.8rem]">
        Paying{" "}
        <em className="font-display italic text-burgundy">{currentName}</em>.
      </h1>
    </header>
  );
}

function RunProgress({
  included,
  summary,
  currentAmount,
}: {
  included: Payee[];
  summary: BatchSummary;
  currentAmount: number;
}) {
  const remaining = summary.total - summary.paid - currentAmount;
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-line bg-bone/40 p-6">
      <header className="flex items-center justify-between">
        <h2 className="m-0 font-display text-xl text-claret-deep">
          Run progress
        </h2>
        <span className="font-mono text-[12px] text-ink-muted">
          {summary.doneCount + 1} / {included.length}
        </span>
      </header>

      <ProgressBar pct={summary.pct} />

      <PayeeProgressList
        included={included}
        doneCount={summary.doneCount}
        activeIdx={summary.activeIdx}
      />

      <Totals paid={summary.paid} inFlight={currentAmount} queued={remaining} />
    </article>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-line">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${pct}%`,
          background:
            "linear-gradient(90deg, #5a1933 0%, #8a2a4a 50%, #c97a8a 100%)",
        }}
      />
    </div>
  );
}

function PayeeProgressList({
  included,
  doneCount,
  activeIdx,
}: {
  included: Payee[];
  doneCount: number;
  activeIdx: number;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {included.map((payee, i) => {
        const isPaid = i < doneCount;
        const isCurrent = i === activeIdx;
        return (
          <li
            key={payee.id}
            className={
              "grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-md p-2 transition-all " +
              (isCurrent
                ? "border border-claret/30 bg-blush/40"
                : isPaid
                  ? "opacity-60"
                  : "")
            }
          >
            <StatusDot isPaid={isPaid} isCurrent={isCurrent} index={i} />
            <span className="text-[13px] text-ink">{payee.name}</span>
            <span className="text-[11px] text-ink-muted">{payee.chain}</span>
            <span className="font-mono text-[12px] tabular-nums text-claret-deep">
              ${payee.amount.toLocaleString()}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function StatusDot({
  isPaid,
  isCurrent,
  index,
}: {
  isPaid: boolean;
  isCurrent: boolean;
  index: number;
}) {
  return (
    <span
      aria-hidden
      className={
        "flex h-6 w-6 items-center justify-center rounded-full text-[10px] " +
        (isPaid
          ? "bg-emerald text-ivory"
          : isCurrent
            ? "bg-claret text-ivory"
            : "border border-line bg-ivory text-ink-muted")
      }
    >
      {isPaid ? "✓" : index + 1}
    </span>
  );
}

function Totals({
  paid,
  inFlight,
  queued,
}: {
  paid: number;
  inFlight: number;
  queued: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
      <Stat label="Paid" value={paid} colour="text-emerald" />
      <Stat label="In flight" value={inFlight} colour="text-claret-deep" />
      <Stat label="Queued" value={queued} colour="text-ink-soft" />
    </div>
  );
}

function Stat({
  label,
  value,
  colour,
}: {
  label: string;
  value: number;
  colour: string;
}) {
  return (
    <div>
      <p className={`m-0 font-display text-lg ${colour}`}>
        ${value.toLocaleString()}
      </p>
      <p className="m-0 text-[10px] uppercase tracking-wider text-ink-muted">
        {label}
      </p>
    </div>
  );
}

function ActivePayeeCard({
  payee,
  onPaid,
  onSkip,
}: {
  payee: Payee;
  onPaid: () => void;
  onSkip: () => void;
}) {
  return (
    <aside
      className="flex flex-col gap-3 self-start rounded-2xl border border-line bg-ivory p-5 sm:p-6"
      style={{ animation: "sf-step 280ms ease-out" }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-full font-mono text-[14px] font-bold text-ivory"
            style={{
              background: `linear-gradient(135deg, hsl(${payee.hue} 60% 50%), hsl(${payee.hue} 70% 30%))`,
            }}
          >
            {payee.initials}
          </span>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-[18px] text-claret-deep">
              {payee.name}
            </span>
            <span className="text-[12px] text-ink-muted">
              {payee.role} · {payee.chain}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-muted hover:border-claret hover:text-claret"
        >
          Skip
        </button>
      </header>

      <div className="rounded-md border border-claret/20 bg-blush/20 p-2.5 text-[11px]">
        <span className="font-mono text-[10px] uppercase tracking-wider text-claret">
          Locked · fees on the studio
        </span>
        <p className="m-0 mt-0.5 text-ink-soft">
          ${payee.amount.toLocaleString()} USDC →{" "}
          <span className="font-mono">{payee.address}</span>
        </p>
      </div>

      <div className="sf-widget">
        <WhiskSend
          amount={String(payee.amount)}
          recipient={STUDIO_TREASURY}
          destinationChain={payee.chainCode}
          onSuccess={() => onPaid()}
        />
      </div>
    </aside>
  );
}
