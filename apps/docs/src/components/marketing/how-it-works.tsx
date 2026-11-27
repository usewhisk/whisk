"use client";

import { motion } from "framer-motion";
import { Box, Wand2 } from "lucide-react";
import { NetworkArc, NetworkBase, NetworkOptimism } from "@web3icons/react";
import { FramedSection } from "./framed-section";
import { CodeWindow, type CodeLine } from "./code-window";
import { cn } from "@/lib/utils";

/**
 * "How does it work?" — three numbered steps, one per row. Visual on
 * the right, copy on the left. Built as separate row components so
 * each step can carry its own bespoke illustration without ballooning
 * a single switch statement.
 */
export function HowItWorks({ className }: { className?: string }) {
  return (
    <FramedSection
      className={className}
      innerClassName="py-24 sm:py-32"
      ariaLabel="How does it work?"
    >
      <div className="w-full lg:px-12 xl:px-16 2xl:px-20">
        <header className="max-w-2xl">
          <p className="font-display text-xs font-medium uppercase tracking-[0.18em] text-primary">
            How does it work?
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Three steps, no plumbing.
          </h2>
          <p className="mt-5 text-balance text-base text-foreground/75 sm:text-lg">
            Install the package, hand it your Circle key, render the surface.
            Whisk runs every wallet, every chain, and every retry inside the
            widget.
          </p>
        </header>

        <div className="mt-20 space-y-24 sm:space-y-32">
          <Step
            n="01"
            title="Install and wrap your app"
            body="Add the two packages. Wrap your tree in <WhiskProvider /> with the chains you accept. That's the entire setup."
            visual={<InstallStepVisual />}
          />
          <Step
            n="02"
            title="Pick the surfaces you need"
            body="Drop in <WhiskSend /> for the styled card, or call useWhisk if you want to build your own UI on the engine."
            visual={<SurfacesStepVisual />}
            reverse
          />
          <Step
            n="03"
            title="Ship. Every chain just works"
            body="The widget handles wallet connect, ENS lookup, balance checks, gas estimation, and Circle's CCTP bridging. Your users sign once on the source chain; the mint lands on the destination."
            visual={<FlowStepVisual />}
          />
        </div>
      </div>
    </FramedSection>
  );
}

function Step({
  n,
  title,
  body,
  visual,
  reverse,
}: {
  n: string;
  title: string;
  body: string;
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-8 sm:gap-10 lg:grid-cols-2 lg:items-center lg:gap-16",
        reverse && "lg:[&>:first-child]:order-2",
      )}
    >
      <div className="min-w-0">
        <span className="font-display text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Step {n}
        </span>
        <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl md:text-4xl">
          {title}
        </h3>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-foreground/75">
          {body}
        </p>
      </div>
      <div className="min-w-0">{visual}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 01 — install snippet                                                 */
/* -------------------------------------------------------------------------- */

function InstallStepVisual() {
  const lines: CodeLine[] = [
    [
      { t: "import", c: "keyword" },
      { t: " { WhiskProvider } " },
      { t: "from", c: "keyword" },
      { t: ' "@usewhisk/react"', c: "string" },
    ],
    null,
    [
      { t: "export default function", c: "keyword" },
      { t: " RootLayout", c: "fn" },
      { t: "({ children }) {" },
    ],
    [{ t: "  " }, { t: "return", c: "keyword" }, { t: " (" }],
    [
      { t: "    " },
      { t: "<", c: "bracket" },
      { t: "WhiskProvider", c: "comp" },
      { t: " " },
      { t: "config", c: "attr" },
      { t: "=", c: "bracket" },
      { t: "{config}" },
      { t: ">", c: "bracket" },
    ],
    [{ t: "      {children}" }],
    [
      { t: "    " },
      { t: "</", c: "bracket" },
      { t: "WhiskProvider", c: "comp" },
      { t: ">", c: "bracket" },
    ],
    [{ t: "  )" }],
    [{ t: "}" }],
  ];
  return <CodeWindow filename="app/layout.tsx" lines={lines} />;
}

/* -------------------------------------------------------------------------- */
/*  Step 02 — surface options                                                 */
/* -------------------------------------------------------------------------- */

function SurfacesStepVisual() {
  const surfaces: Array<{
    name: string;
    snippet: string;
    sub: string;
    Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }> = [
    {
      name: "WhiskSend",
      snippet: "<WhiskSend />",
      sub: "Styled send + bridge card",
      Icon: Box,
    },
    {
      name: "useWhisk",
      snippet: "const wk = useWhisk()",
      sub: "Headless hook. Your UI, our engine",
      Icon: Wand2,
    },
  ];
  return (
    <div className="space-y-3">
      {surfaces.map((s, i) => (
        <motion.div
          key={s.name}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: i * 0.05, duration: 0.4, ease: "easeOut" }}
          className="flex items-center gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <s.Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-sm font-semibold text-foreground">
                {s.name}
              </span>
              <code className="truncate font-mono text-[11px] text-foreground/55">
                {s.snippet}
              </code>
            </div>
            <p className="mt-0.5 text-[13px] text-foreground/75">{s.sub}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 03 — animated flow                                                   */
/* -------------------------------------------------------------------------- */

function FlowStepVisual() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-8">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <FlowEnd label="User signs" sub="on source chain" Icon={NetworkBase} />
        <Beam phase="first" />
        <FlowMid />
        <Beam phase="second" />
        <FlowEnd
          label="Mint lands"
          sub="on destination"
          Icon={NetworkOptimism}
        />
      </div>
      <div className="mt-6 flex items-center justify-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-display text-[10px] font-medium uppercase tracking-[0.15em] text-primary">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/50" />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          Powered by Circle CCTP + Iris
        </span>
      </div>
    </div>
  );
}

function FlowEnd({
  label,
  sub,
  Icon,
}: {
  label: string;
  sub: string;
  Icon: React.ComponentType<{
    variant?: "branded" | "mono" | "background";
    size?: number;
  }>;
}) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center text-center sm:w-24">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background shadow-sm sm:h-14 sm:w-14 sm:rounded-2xl">
        <Icon variant="branded" size={26} />
      </span>
      <span className="mt-2 font-display text-[11px] font-semibold text-foreground sm:mt-3 sm:text-[12px]">
        {label}
      </span>
      <span className="mt-0.5 text-[10px] text-foreground/60 sm:text-[11px]">
        {sub}
      </span>
    </div>
  );
}

function FlowMid() {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center text-center sm:w-24">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/40 bg-primary/15 sm:h-14 sm:w-14 sm:rounded-2xl">
        <NetworkArc variant="branded" size={26} />
      </span>
      <span className="mt-2 font-display text-[11px] font-semibold text-primary sm:mt-3 sm:text-[12px]">
        Iris relays
      </span>
      <span className="mt-0.5 text-[10px] text-foreground/60 sm:text-[11px]">
        attestation
      </span>
    </div>
  );
}

/**
 * One leg of the flow. The two beams share a 3-second cycle but play
 * sequentially: the first-leg dot rides 0→100% during the first half,
 * fades out, then the second-leg dot fades in at 0% and rides 0→100%
 * during the second half. So the eye follows a single packet leaving
 * the source, arriving at Iris, and continuing on to the destination —
 * the real CCTP flow.
 */
function Beam({ phase }: { phase: "first" | "second" }) {
  const first = phase === "first";
  return (
    <div
      aria-hidden
      className="relative h-px flex-1"
      style={{
        backgroundImage:
          "repeating-linear-gradient(to right, hsl(var(--primary)/0.45) 0 6px, transparent 6px 12px)",
      }}
    >
      <motion.span
        className="absolute -top-1 h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_2px_hsl(var(--primary)/0.6)]"
        initial={{ left: "0%", opacity: 0 }}
        animate={
          first
            ? {
                // Visible + travelling during the first 50% of the cycle.
                left: ["0%", "0%", "100%", "100%", "100%"],
                opacity: [0, 1, 1, 0, 0],
              }
            : {
                // Hidden through the first 50%, then visible + travelling.
                left: ["0%", "0%", "0%", "100%", "100%"],
                opacity: [0, 0, 1, 1, 0],
              }
        }
        transition={{
          duration: 3,
          times: first ? [0, 0.05, 0.48, 0.5, 1] : [0, 0.5, 0.55, 0.98, 1],
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}
