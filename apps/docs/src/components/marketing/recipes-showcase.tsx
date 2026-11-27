"use client";

import * as Tabs from "@radix-ui/react-tabs";
import * as HoverCard from "@radix-ui/react-hover-card";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { FramedSection } from "./framed-section";
import { BrowserFrame } from "./browser-frame";
import { CodeWindow, type CodeLine, type Token } from "./code-window";
import {
  DonateShell,
  EcommerceShell,
  InvoiceShell,
  PayrollShell,
  SaasShell,
} from "./recipes/recipe-shells";
import { cn } from "@/lib/utils";

type Recipe = {
  id: string;
  tab: string;
  url: string;
  title: string;
  blurb: string;
  href: string;
  Shell: React.ComponentType;
  /** Snippet rendered in the hover popover with full syntax highlighting. */
  snippet: ReadonlyArray<CodeLine>;
};

/* -------------------------------------------------------------------------- */
/*  Tiny helpers to keep snippet definitions readable                          */
/* -------------------------------------------------------------------------- */

const k = (t: string): Token => ({ t, c: "keyword" });
const s = (t: string): Token => ({ t, c: "string" });
const c = (t: string): Token => ({ t, c: "comp" });
const a = (t: string): Token => ({ t, c: "attr" });
const b = (t: string): Token => ({ t, c: "bracket" });
const f = (t: string): Token => ({ t, c: "fn" });
const cm = (t: string): Token => ({ t, c: "comment" });
const txt = (t: string): Token => ({ t });

const RECIPES: Recipe[] = [
  {
    id: "ecommerce",
    tab: "E-commerce",
    url: "atelier-hibiscus.com/checkout",
    title: "E-commerce checkout",
    blurb:
      "Recipient + total + both chains are locked from the cart. The widget collapses to a confirm-and-pay surface so the buyer can't fat-finger it.",
    href: "https://whisk-ecommerce-checkout.vercel.app/",
    Shell: EcommerceShell,
    snippet: [
      [b("<"), c("WhiskSend"), txt("")],
      [txt("  "), a("recipient"), b("={"), txt("MERCHANT_WALLET"), b("}")],
      [txt("  "), a("amount"), b("="), s('"87.00"')],
      [txt("  "), a("sourceChain"), b("="), s('"Base"')],
      [txt("  "), a("destinationChain"), b("="), s('"Base"')],
      [b("/>")],
    ],
  },
  {
    id: "donate",
    tab: "Donate",
    url: "support.openforest.org/donate",
    title: "Donate button",
    blurb:
      "Treasury wallet and both chains are pinned. Donors pick from preset amounts the host renders above the widget; the selection seeds defaultAmount.",
    href: "https://whisk-donate-button.vercel.app/",
    Shell: DonateShell,
    snippet: [
      [
        k("const"),
        txt(" ["),
        txt("amount"),
        txt(", setAmount] = "),
        f("useState"),
        b("("),
        s('"25"'),
        b(")"),
      ],
      [],
      [b("<"), c("WhiskSend"), txt("")],
      [txt("  "), a("recipient"), b("={"), txt("ORG_TREASURY"), b("}")],
      [txt("  "), a("defaultAmount"), b("={"), txt("amount"), b("}")],
      [txt("  "), a("sourceChain"), b("="), s('"Optimism"')],
      [txt("  "), a("destinationChain"), b("="), s('"Optimism"')],
      [txt("  "), a("onAmountChange"), b("={"), txt("setAmount"), b("}")],
      [b("/>")],
    ],
  },
  {
    id: "saas",
    tab: "Themed SaaS",
    url: "app.steelpath.cloud/billing/feb-2026",
    title: "Themed SaaS dashboard",
    blurb:
      "Override --whisk-* CSS variables once and the widget repaints to the dashboard's palette. The customer can pay from any chain; Whisk bridges to the treasury chain automatically.",
    href: "https://whisk-themed-saas.vercel.app/",
    Shell: SaasShell,
    snippet: [
      [cm("// customer pays from their L2, treasury collects on Base")],
      [b("<"), c("WhiskSend"), txt("")],
      [txt("  "), a("recipient"), b("={"), txt("WORKSPACE_WALLET"), b("}")],
      [txt("  "), a("amount"), b("={"), txt("invoice.total"), b("}")],
      [txt("  "), a("sourceChain"), b("="), s('"Arbitrum"')],
      [txt("  "), a("destinationChain"), b("="), s('"Base"')],
      [b("/>")],
    ],
  },
  {
    id: "payroll",
    tab: "Payroll",
    url: "payroll.studio-fortune.app/runs/feb-2026",
    title: "Payroll batch",
    blurb:
      "An admin tool that walks a list of payees. The widget remounts per row with the payee's address + amount locked, and bridges treasury USDC to whatever chain the payee prefers.",
    href: "https://whisk-payroll-batch.vercel.app/",
    Shell: PayrollShell,
    snippet: [
      [cm("// treasury on Base, payees collect on Polygon")],
      [txt("{run.payees."), f("map"), b("("), txt("p "), b("=>")],
      [txt("  "), b("<"), c("WhiskSend"), txt("")],
      [txt("    "), a("key"), b("={"), txt("p.id"), b("}")],
      [txt("    "), a("recipient"), b("={"), txt("p.wallet"), b("}")],
      [txt("    "), a("amount"), b("={"), txt("p.amountUsd"), b("}")],
      [txt("    "), a("sourceChain"), b("="), s('"Base"')],
      [txt("    "), a("destinationChain"), b("="), s('"Polygon"')],
      [txt("  "), b("/>")],
      [b(")}")],
    ],
  },
  {
    id: "invoice",
    tab: "Invoice link",
    url: "pay.studiohibiscus.com/i/2026-014",
    title: "Invoice payment link",
    blurb:
      "A shareable URL that opens a pre-filled checkout. Everything comes from the invoice record, including the source chain the client is paying from. Whisk bridges to the studio's home chain in one click.",
    href: "https://whisk-invoice-link.vercel.app/",
    Shell: InvoiceShell,
    snippet: [
      [cm("// app/i/[id]/page.tsx")],
      [cm("// client on Solana, studio collects on Base")],
      [b("<"), c("WhiskSend"), txt("")],
      [txt("  "), a("recipient"), b("={"), txt("invoice.payeeWallet"), b("}")],
      [txt("  "), a("amount"), b("={"), txt("invoice.amountDue"), b("}")],
      [txt("  "), a("sourceChain"), b("="), s('"Solana"')],
      [txt("  "), a("destinationChain"), b("="), s('"Base"')],
      [b("/>")],
    ],
  },
];

export function RecipesShowcase({ className }: { className?: string }) {
  const [value, setValue] = useState<string>(RECIPES[0]!.id);
  return (
    <FramedSection
      id="examples"
      className={className}
      innerClassName="py-24 sm:py-32"
      ariaLabel="Recipes"
    >
      <div className="w-full lg:px-12 xl:px-16 2xl:px-20">
        <header className="mx-auto max-w-2xl text-center">
          <p className="font-display text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Recipes
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            A few places Whisk fits in.
          </h2>
          <p className="mt-5 text-balance text-base text-foreground/75 sm:text-lg">
            Each tab is a basic integration that shows how Whisk slots into a
            different kind of product. They aren't finished apps. They're
            starting points you can clone and adapt. Whisk isn't limited to
            these use cases. It fits anywhere a USDC payment or cross-chain
            transfer belongs.
          </p>
        </header>

        <Tabs.Root
          value={value}
          onValueChange={setValue}
          className="mt-12 flex flex-col items-center"
        >
          <Tabs.List
            aria-label="Recipes"
            className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-border/70 bg-card/70 p-1 shadow-sm sm:flex-wrap sm:justify-center sm:overflow-visible"
          >
            {RECIPES.map((r) => (
              <Tabs.Trigger
                key={r.id}
                value={r.id}
                className={cn(
                  "relative shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 font-display text-[13px] font-medium text-foreground/70 outline-none transition-colors",
                  "data-[state=active]:text-primary-foreground",
                  "hover:text-foreground",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              >
                {value === r.id && (
                  <motion.span
                    layoutId="recipe-bg"
                    className="absolute inset-0 rounded-full bg-primary"
                    transition={{ type: "spring", duration: 0.4 }}
                  />
                )}
                <span className="relative z-10">{r.tab}</span>
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <div className="mt-10 w-full">
            <AnimatePresence mode="wait">
              {RECIPES.map(
                (r) =>
                  value === r.id && (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.3 }}
                    >
                      <BrowserFrame
                        url={r.url}
                        bodyClassName="min-h-[34rem] sm:min-h-0 sm:aspect-[16/10] lg:aspect-[16/9]"
                      >
                        <r.Shell />
                      </BrowserFrame>

                      <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
                        <div className="max-w-xl">
                          <h3 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                            {r.title}
                          </h3>
                          <p className="mt-1.5 text-[14px] leading-relaxed text-foreground/75">
                            {r.blurb}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <SnippetHover snippet={r.snippet} />
                          <a
                            href={r.href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-5 font-display text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                          >
                            See live demo
                            <ArrowUpRight className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  ),
              )}
            </AnimatePresence>
          </div>
        </Tabs.Root>
      </div>
    </FramedSection>
  );
}

function SnippetHover({ snippet }: { snippet: ReadonlyArray<CodeLine> }) {
  return (
    <HoverCard.Root openDelay={120} closeDelay={120}>
      <HoverCard.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border/70 bg-card px-4 font-display text-[13px] font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <span className="font-mono text-[12px] text-primary">{`{ }`}</span>
          See the code
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          align="end"
          sideOffset={12}
          collisionPadding={16}
          className="z-50 w-[min(26rem,calc(100vw-2rem))] shadow-2xl shadow-foreground/20"
        >
          <CodeWindow
            filename="recipe.tsx"
            size="sm"
            showLineNumbers={false}
            lines={snippet}
          />
          <HoverCard.Arrow className="fill-foreground/15" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
