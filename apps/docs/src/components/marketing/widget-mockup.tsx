"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stylised, motion-driven representation of the real `<WhiskSend>`
 * widget. Loops through four stages:
 *
 *   0  Connect       — the disconnected CTA state
 *   1  Compose       — recipient + amount + token picker
 *   2  Review        — quote breakdown
 *   3  Success       — "USDC delivered" confirmation
 *
 * No wallet code is loaded. The whole component weighs ~5 KB gzipped
 * and never breaks because of an RPC outage, a wallet provider
 * change, or a network switch. The visual contract — fonts, spacing,
 * earth-tone palette, chip + pill styling — matches the real widget
 * closely enough that visitors recognise it the first time they
 * install for real.
 */

type Stage = 0 | 1 | 2 | 3;

const STAGE_DURATION_MS = 3200;

const STAGES_META: Record<
  Stage,
  { label: string; tone: "muted" | "primary" | "success" }
> = {
  0: { label: "Disconnected", tone: "muted" },
  1: { label: "Compose", tone: "primary" },
  2: { label: "Review", tone: "primary" },
  3: { label: "Sent", tone: "success" },
};

export function WidgetMockup({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState<Stage>(0);

  useEffect(() => {
    if (reduceMotion) {
      // Honour user preference — skip straight to the most informative
      // state and stop animating.
      setStage(2);
      return;
    }
    const id = setInterval(() => {
      setStage((current) => ((current + 1) % 4) as Stage);
    }, STAGE_DURATION_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  const meta = STAGES_META[stage];

  return (
    <div className={cn("relative", className)}>
      {/* Card */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl shadow-primary/5">
        <CardHeader stageLabel={meta.label} tone={meta.tone} />

        <div className="relative h-[21rem] md:h-[20rem] overflow-hidden px-5 pb-5">
          <AnimatePresence mode="wait">
            {stage === 0 ? (
              <StageConnect key="connect" />
            ) : stage === 1 ? (
              <StageCompose key="compose" />
            ) : stage === 2 ? (
              <StageReview key="review" />
            ) : (
              <StageSuccess key="success" />
            )}
          </AnimatePresence>
        </div>

        <ProgressBar stage={stage} />
      </div>

      {/* Decorative orbits behind the card (clipped by overflow on the
          parent section, so a soft glow is all that bleeds out). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute lg:-inset-6 -inset-4 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_100%)]"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Card chrome                                                                */
/* -------------------------------------------------------------------------- */

function CardHeader({
  stageLabel,
  tone,
}: {
  stageLabel: string;
  tone: "muted" | "primary" | "success";
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
      <NetworkPill chain="Arc" tone={tone} />
      <AccountChip />
    </div>
  );
}

function NetworkPill({
  chain,
  tone,
}: {
  chain: string;
  tone: "muted" | "primary" | "success";
}) {
  const dot =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "primary"
        ? "bg-primary"
        : "bg-muted-foreground/60";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2 py-1 text-xs font-medium">
      <motion.span
        layout
        className={cn("h-1.5 w-1.5 rounded-full", dot)}
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
      {chain}
    </span>
  );
}

function AccountChip() {
  return (
    <button
      type="button"
      className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-border bg-background/40 px-2 py-1 text-xs font-medium"
    >
      <span
        aria-hidden="true"
        className="h-3 w-3 rounded-full"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, color-mix(in srgb, hsl(var(--primary)) 60%, hsl(var(--background))) 100%)",
        }}
      />
      <span className="font-mono text-[11px]">0xd9dB…E645</span>
      <ChevronDown className="h-3 w-3 opacity-60" />
    </button>
  );
}

function ProgressBar({ stage }: { stage: Stage }) {
  const percentage = ((stage + 1) / 4) * 100;
  return (
    <div className="h-0.5 bg-border/50">
      <motion.div
        className="h-full bg-primary"
        initial={false}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stage 0 — Connect                                                          */
/* -------------------------------------------------------------------------- */

function StageConnect() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-stretch gap-4 pt-8 text-center"
    >
      <div className="mx-auto inline-flex items-center gap-2">
        <Wallet className="h-4 w-4" />
        <span className="font-semibold">Connect to continue</span>
      </div>
      <p className="mx-auto max-w-xs text-xs text-foreground/75">
        Send or bridge USDC across chains. Whisk never holds your keys.
      </p>
      <PrimaryButton>Connect wallet</PrimaryButton>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stage 1 — Compose                                                          */
/* -------------------------------------------------------------------------- */

function StageCompose() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-2.5 pt-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <FieldBoxStatic label="From" value="Arc" />
        <FieldBoxStatic label="To" value="Base" />
      </div>

      <FieldBoxStatic
        label={
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-2.5 w-2.5" />
            Recipient resolved
          </span>
        }
        value="0xbe03CE…e70Fe2"
        mono
      />

      <div className="flex items-stretch gap-2">
        <FieldBoxStatic label="Amount" value="6.00" big className="flex-1" />
        <TokenPickerStatic />
      </div>

      <div className="flex items-center justify-between px-1 text-[11px] text-foreground/75">
        <span>
          Balance:{" "}
          <span className="font-mono text-foreground/80">36.178034 USDC</span>
        </span>
        <button
          type="button"
          className="cursor-default rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary"
        >
          Max
        </button>
      </div>

      <PrimaryButton className="mt-1">
        Review <ArrowRight className="h-3.5 w-3.5" />
      </PrimaryButton>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stage 2 — Review                                                           */
/* -------------------------------------------------------------------------- */

function StageReview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-3 pt-3"
    >
      <div className="flex items-center gap-1.5">
        <ArrowRight className="h-3.5 w-3.5 -rotate-45 text-primary" />
        <ArrowRight className="h-3.5 w-3.5 text-primary" />
        <span className="text-base font-semibold">Review transfer</span>
      </div>

      <p className="text-xs text-foreground/75">
        One-hop CCTP bridge. Auto-relayed mint on destination.
      </p>

      <dl className="space-y-1.5 text-[13px]">
        <SummaryRow label="Recipient gets" value="6 USDC" />
        <SummaryRow label="Route" value="Arc → Base" />
        <SummaryRow label="To" value="0xbe03CE…e70Fe2" mono />
      </dl>

      <div className="border-t border-dashed border-border/60 pt-2 text-[13px]">
        <div className="flex items-center justify-between text-xs text-foreground/75">
          <span>Provider fee</span>
          <span className="font-mono">0.00022 USDC</span>
        </div>
        <div className="mt-2 flex items-center justify-between font-semibold">
          <span>You pay</span>
          <span className="font-mono">6.00022 USDC</span>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] text-foreground/75">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>~30s · forwarder enabled</span>
      </div>

      <PrimaryButton>Send 6 USDC</PrimaryButton>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stage 3 — Success                                                          */
/* -------------------------------------------------------------------------- */

function StageSuccess() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-stretch gap-3 pt-3"
    >
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
        <Check className="h-3 w-3" />
        Sent
      </span>

      <div>
        <h3 className="text-xl font-semibold tracking-tight">
          6 USDC delivered
        </h3>
        <p className="mt-0.5 font-mono text-xs text-foreground/75">
          0x0a133e…eb01cd
        </p>
      </div>

      <ol className="space-y-2 text-[13px]">
        <StepRow label="Authorize" done explorer />
        <StepRow label="Burn on source" done explorer />
        <StepRow label="Wait for confirmation" done />
        <StepRow label="Mint on destination" done explorer />
      </ol>

      <button
        type="button"
        className="mt-1 inline-flex h-9 w-full cursor-default items-center justify-center gap-1.5 rounded-md border border-border bg-background text-sm font-medium text-foreground"
      >
        Send another
      </button>
    </motion.div>
  );
}

function StepRow({
  label,
  done,
  explorer,
}: {
  label: string;
  done?: boolean;
  explorer?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center rounded-full border",
            done
              ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "border-border text-foreground/75",
          )}
        >
          {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
        </span>
        <span className={done ? "text-foreground" : "text-foreground/75"}>
          {label}
        </span>
      </span>
      {explorer ? (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-foreground/75">
          tx <ExternalLink className="h-2.5 w-2.5" />
        </span>
      ) : null}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Field primitives                                                           */
/* -------------------------------------------------------------------------- */

function FieldBoxStatic({
  label,
  value,
  mono,
  big,
  className,
}: {
  label: React.ReactNode;
  value: string;
  mono?: boolean;
  big?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-background/50 px-2.5 py-1.5",
        className,
      )}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-foreground/75">
        {label}
      </div>
      <div
        className={cn(
          "text-foreground",
          big ? "text-xl font-semibold" : "text-[13px]",
          mono && "font-mono",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function TokenPickerStatic() {
  return (
    <button
      type="button"
      className="inline-flex h-auto cursor-default items-center gap-1.5 self-stretch rounded-md border border-border bg-background px-3 text-sm font-semibold"
    >
      USDC
      <ChevronDown className="h-3 w-3 opacity-60" />
    </button>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs text-foreground/75">{label}</dt>
      <dd className={cn(mono && "font-mono", "text-foreground")}>{value}</dd>
    </div>
  );
}

function PrimaryButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 w-full cursor-default items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </button>
  );
}
