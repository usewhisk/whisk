"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Code2,
  GitBranch,
  Layers,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { FramedSection } from "./framed-section";
import { cn } from "@/lib/utils";

type Audience = {
  id: string;
  label: string;
  blurb: string;
  bullets: Array<{
    title: string;
    body: string;
    Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }>;
};

const AUDIENCES: Audience[] = [
  {
    id: "developers",
    label: "Developers",
    blurb:
      "If you'd rather wire one component than rebuild wallet, chain, ENS, and CCTP plumbing for the third time, Whisk is the way out.",
    bullets: [
      {
        title: "Headless or styled, your call",
        body: "Mount the card, or call useWhisk and own the UI. Same engine, your design system.",
        Icon: Code2,
      },
      {
        title: "Type-safe across every chain",
        body: "Chain literals, token symbols, and event payloads all narrow in your editor. No any, no surprises at runtime.",
        Icon: ShieldCheck,
      },
      {
        title: "Open source, MIT-licensed",
        body: "Read the engine, fork the widget, copy a pattern. Whisk lives on GitHub, with the docs, the examples, and the changelog.",
        Icon: GitBranch,
      },
    ],
  },
  {
    id: "companies",
    label: "Companies",
    blurb:
      "Ship a USDC send or cross-chain payment this sprint without standing up a wallet team. Whisk is the production payment layer, on day one.",
    bullets: [
      {
        title: "Production-grade safety net",
        body: "Pre-flight balance + gas checks, mid-flight retry surface, manual mint recovery on CCTP. Customers don't lose money on transient failures.",
        Icon: ShieldCheck,
      },
      {
        title: "Theme to your brand in minutes",
        body: "Override CSS variables, drop your logo in the chrome. Whisk reads --whisk-primary and the whole widget follows.",
        Icon: Sparkles,
      },
      {
        title: "Wallet support without the maintenance",
        body: "MetaMask, WalletConnect, Coinbase, Phantom and the other common wallets, without you tracking provider upgrades.",
        Icon: Wallet,
      },
    ],
  },
];

export function BuiltFor({ className }: { className?: string }) {
  const [value, setValue] = useState<string>(AUDIENCES[0]!.id);
  return (
    <FramedSection
      className={className}
      innerClassName="py-24 sm:py-32"
      ariaLabel="Built for"
    >
      <div className="w-full lg:px-12 xl:px-16 2xl:px-20">
        <header className="mx-auto max-w-2xl text-center">
          <p className="font-display text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Built for
          </p>
          <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Whoever's shipping the payment.
          </h2>
          <p className="mt-5 text-balance text-base text-foreground/75 sm:text-lg">
            A widget for both sides of the integration: the engineer touching
            the code, and the company shipping the product.
          </p>
        </header>

        <Tabs.Root
          value={value}
          onValueChange={setValue}
          className="mt-12 flex flex-col items-center"
        >
          <Tabs.List
            aria-label="Built for"
            className="inline-flex rounded-full border border-border/70 bg-card/70 p-1 shadow-sm"
          >
            {AUDIENCES.map((a) => (
              <Tabs.Trigger
                key={a.id}
                value={a.id}
                className={cn(
                  "relative rounded-full px-6 py-2 font-display text-sm font-medium text-foreground/70 outline-none transition-colors",
                  "data-[state=active]:text-primary-foreground",
                  "hover:text-foreground",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              >
                {value === a.id && (
                  <motion.span
                    layoutId="built-for-bg"
                    className="absolute inset-0 rounded-full bg-primary"
                    transition={{ type: "spring", duration: 0.4 }}
                  />
                )}
                <span className="relative z-10">{a.label}</span>
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <div className="mt-12 w-full">
            <AnimatePresence mode="wait">
              {AUDIENCES.map(
                (a) =>
                  value === a.id && (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25 }}
                    >
                      <p className="mx-auto max-w-2xl text-balance text-center text-[15px] leading-relaxed text-foreground/75 sm:text-base">
                        {a.blurb}
                      </p>
                      <div className="mt-12 grid gap-5 md:grid-cols-3">
                        {a.bullets.map((b) => (
                          <div
                            key={b.title}
                            className="flex flex-col rounded-2xl border border-border/70 bg-card/80 p-6 shadow-sm"
                          >
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
                              <b.Icon className="h-5 w-5" strokeWidth={1.75} />
                            </span>
                            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight text-foreground">
                              {b.title}
                            </h3>
                            <p className="mt-2 text-[14px] leading-relaxed text-foreground/75">
                              {b.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ),
              )}
            </AnimatePresence>
          </div>
        </Tabs.Root>

        <div className="mt-12 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-4 py-1.5 text-[12px] text-foreground/70">
            <Layers className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
            One package, both audiences. No fork, no enterprise tier.
          </span>
        </div>
      </div>
    </FramedSection>
  );
}
