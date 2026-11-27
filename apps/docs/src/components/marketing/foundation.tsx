"use client";

import { useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { NetworkArc } from "@web3icons/react";
import { FramedSection } from "./framed-section";

/**
 * "Built on a solid foundation" — the trust strip.
 *
 * Two prominent stack tiles call out the two things that *actually*
 * power Whisk: Circle (CCTP V2) and Arc Network. Underneath, a
 * thin band of animated stats backs them up with numbers.
 */
export function Foundation({ className }: { className?: string }) {
  return (
    <FramedSection
      className={className}
      innerClassName="py-24 sm:py-32"
      ariaLabel="Built on a solid foundation"
    >
      <div className="w-full lg:px-12 xl:px-16 2xl:px-20">
        <header className="mx-auto max-w-2xl text-center">
          <p className="font-display text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Foundation
          </p>
          <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Built on tools that already settle real money.
          </h2>
          <p className="mt-5 text-balance text-base text-foreground/75 sm:text-lg">
            Whisk isn't a new stablecoin stack. It's an opinionated shell over
            Circle's payments rails and the chain they're built around.
          </p>
        </header>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <BigTile
            name="Circle"
            tag="CCTP V2 · Iris · Forwarder"
            body="The wallet engine, the chain support, and the cross-chain transfer protocol. Whisk talks to Circle's SDK so you don't have to integrate three things separately."
            mark={
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-background ring-1 ring-border/60">
                <Image
                  src="/circle-icon.png"
                  alt=""
                  width={64}
                  height={64}
                  className="h-9 w-9 object-contain"
                />
              </span>
            }
            accent="bg-[#2775ca]/10"
          />
          <BigTile
            name="Arc Network"
            tag="USDC-native chain · sub-second finality"
            body="Arc is Circle's purpose-built stablecoin chain, and it's the canonical home for USDC flows. Whisk ships with Arc support on day zero and routes there by default when you don't pin a chain."
            mark={
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-background ring-1 ring-border/60">
                <NetworkArc variant="branded" size={36} />
              </span>
            }
            accent="bg-primary/8"
          />
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/40 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            value={20}
            suffix=""
            label="Chains supported"
            sub="On their testnets today, mainnet behind the gate"
          />
          <Stat
            value={6}
            suffix=""
            label="Stablecoins"
            sub="USDC, EURC, USDT, USDe, DAI, PYUSD"
          />
          <Stat
            value={100}
            suffix="%"
            label="MIT-licensed"
            sub="Engine, widget, examples, docs"
          />
          <Stat
            value={3}
            suffix=" lines"
            label="To ship"
            sub="Install, provider, surface"
          />
        </div>
      </div>
    </FramedSection>
  );
}

function BigTile({
  name,
  tag,
  body,
  mark,
  accent,
}: {
  name: string;
  tag: string;
  body: string;
  mark: React.ReactNode;
  accent: string;
}) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-8 shadow-sm transition-colors hover:border-primary/30">
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl ${accent}`}
      />
      <div className="relative flex items-start gap-5">
        {mark}
        <div className="flex flex-col">
          <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {name}
          </h3>
          <p className="mt-0.5 font-display text-[12px] font-medium uppercase tracking-[0.15em] text-primary/90">
            {tag}
          </p>
        </div>
      </div>
      <p className="relative mt-5 text-[15px] leading-relaxed text-foreground/75">
        {body}
      </p>
    </article>
  );
}

function Stat({
  value,
  suffix,
  label,
  sub,
}: {
  value: number;
  suffix?: string;
  label: string;
  sub: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div ref={ref} className="bg-card/90 p-7 sm:p-8">
      <div className="font-display text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
        <Counter value={value} active={inView} />
        <span className="text-primary">{suffix}</span>
      </div>
      <div className="mt-3 font-display text-sm font-medium uppercase tracking-[0.12em] text-foreground/75">
        {label}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-foreground/55">
        {sub}
      </p>
    </div>
  );
}

function Counter({ value, active }: { value: number; active: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const duration = 1100;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, value]);
  return <span>{n}</span>;
}
