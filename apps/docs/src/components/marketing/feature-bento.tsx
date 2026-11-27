import { Fragment } from "react";
import {
  ArrowDownToLine,
  Code2,
  Globe2,
  Palette,
  PuzzleIcon,
  ShieldCheck,
} from "lucide-react";
import type { ComponentType, SVGAttributes } from "react";
import { FramedSection } from "./framed-section";
import { CodeWindow, type CodeLine } from "./code-window";
import {
  NetworkArbitrumOne,
  NetworkArc,
  NetworkAvalanche,
  NetworkBase,
  NetworkCodex,
  NetworkEthereum,
  NetworkHyperEvm,
  NetworkInk,
  NetworkLinea,
  NetworkMonad,
  NetworkOptimism,
  NetworkPlume,
  NetworkPolygon,
  NetworkSeiNetwork,
  NetworkSolana,
  NetworkSonic,
  NetworkUnichain,
  NetworkWorld,
} from "@web3icons/react";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    title: "Every chain CCTP V2 reaches",
    body: "18 testnets, 21 mainnets. Arc, Base, Arbitrum, Optimism, Linea, Sonic, Sei, HyperEVM, Monad, and on. One widget, one config.",
    Icon: Globe2,
    span: "md:col-span-2",
    visual: <ChainGridVisual />,
  },
  {
    title: "Type-safe end to end",
    body: "Chain names are a real union type from @usewhisk/react. A typo fails the build, not the user.",
    Icon: ShieldCheck,
    span: "md:col-span-1",
    visual: <TypeSafeVisual />,
  },
  {
    title: "Themed to your brand",
    body: "Whisk reads CSS variables. Override `--whisk-primary` once and the whole widget follows. Light, dark, your own palette.",
    Icon: Palette,
    span: "md:col-span-1",
    visual: <PaletteVisual />,
  },
  {
    title: "Bridges in one signature",
    body: "Circle's Iris service relays the mint on the destination chain, so the user only signs on the source. No chain-switch dance.",
    Icon: ArrowDownToLine,
    span: "md:col-span-2",
    visual: <FlowVisual />,
  },
  {
    title: "Hooks if you want them",
    body: "Skip the styled card and call `useWhisk` and `useWhiskAccount` directly. Same engine, your UI.",
    Icon: Code2,
    span: "md:col-span-1",
    visual: <HeadlessVisual />,
  },
  {
    title: "Resolvers you can stack",
    body: "Addresses, ENS, and ENSIP-11 ship by default. Plug in Lens, Farcaster, an email lookup or whatever you need with `composeResolvers`.",
    Icon: PuzzleIcon,
    span: "md:col-span-2",
    visual: <ResolverPipelineVisual />,
  },
];

export function FeatureBento({ className }: { className?: string }) {
  return (
    <FramedSection
      className={className}
      innerClassName="py-24 sm:py-32"
      ariaLabel="Why Whisk"
    >
      <div className="w-full lg:px-12 xl:px-16 2xl:px-20">
        <header className="mx-auto max-w-2xl text-center">
          <p className="font-display text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Why Whisk
          </p>
          <h2 className="mt-3 text-balance font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Built for the integration, not the demo.
          </h2>
          <p className="mt-5 text-balance text-base text-foreground/75 sm:text-lg">
            Every detail you'd otherwise build yourself (themed, typed,
            chain-aware) already sits behind the component.
          </p>
        </header>

        <div className="mt-16 grid gap-5 md:grid-cols-3 md:gap-6">
          {FEATURES.map((feat) => (
            <article
              key={feat.title}
              className={cn(
                "group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-lg hover:shadow-foreground/5 sm:p-7",
                feat.span,
              )}
            >
              <feat.Icon
                className="h-5 w-5 text-primary"
                strokeWidth={2}
                aria-hidden="true"
              />
              <h3 className="mt-4 font-display text-xl font-semibold tracking-tight text-foreground">
                {feat.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-foreground/75">
                {feat.body}
              </p>

              {feat.visual ? (
                <div className="-mx-5 -mb-5 mt-6 flex-1 overflow-hidden sm:-mx-7 sm:-mb-7">
                  {feat.visual}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </FramedSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cell visuals — pure SVG / CSS                                             */
/* -------------------------------------------------------------------------- */

type Web3Icon = ComponentType<
  SVGAttributes<SVGSVGElement> & {
    variant?: "branded" | "mono" | "background";
    size?: number | string;
  }
>;

const BENTO_CHAINS: Array<{ id: string; Icon: Web3Icon }> = [
  { id: "arc", Icon: NetworkArc },
  { id: "base", Icon: NetworkBase },
  { id: "arb", Icon: NetworkArbitrumOne },
  { id: "opt", Icon: NetworkOptimism },
  { id: "linea", Icon: NetworkLinea },
  { id: "sonic", Icon: NetworkSonic },
  { id: "sei", Icon: NetworkSeiNetwork },
  { id: "hyper", Icon: NetworkHyperEvm },
  { id: "monad", Icon: NetworkMonad },
  { id: "eth", Icon: NetworkEthereum },
  { id: "polygon", Icon: NetworkPolygon },
  { id: "plume", Icon: NetworkPlume },
  { id: "unichain", Icon: NetworkUnichain },
  { id: "ink", Icon: NetworkInk },
  { id: "codex", Icon: NetworkCodex },
  { id: "avax", Icon: NetworkAvalanche },
  { id: "solana", Icon: NetworkSolana },
  { id: "world", Icon: NetworkWorld },
];

/**
 * Wall of branded chain logos in proper square tiles. Faded at the
 * bottom so the grid reads as "more underneath" without dominating.
 */
function ChainGridVisual() {
  return (
    <div
      className="relative px-5 pb-5 pt-2 sm:px-7 sm:pb-7"
      style={{
        maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, black 70%, transparent 100%)",
      }}
    >
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6 sm:gap-2 md:grid-cols-9 md:gap-2.5">
        {BENTO_CHAINS.map(({ id, Icon }) => (
          <div
            key={id}
            className="flex aspect-square items-center justify-center rounded-lg border border-border/70 bg-background/70 ring-1 ring-inset ring-foreground/[0.03] transition-colors hover:border-primary/40 hover:bg-background"
          >
            <Icon variant="branded" size={48} aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Real Whisk `Chain` union from `@usewhisk/react` (re-exported from
 * `@usewhisk/core`, see `packages/core/src/types/chain.ts`). A typo
 * fails at the TypeScript layer, never at runtime.
 */
function TypeSafeVisual() {
  const lines: CodeLine[] = [
    [
      { t: "import type", c: "keyword" },
      { t: " { Chain } " },
      { t: "from", c: "keyword" },
      { t: ' "@usewhisk/react"', c: "string" },
    ],
    [
      { t: "const", c: "keyword" },
      { t: " chain: " },
      { t: "Chain", c: "type" },
      { t: " = " },
      { t: '"Arc_Testnet"', c: "string" },
    ],
    [
      { t: "const", c: "keyword" },
      { t: " bad: " },
      { t: "Chain", c: "type" },
      { t: " = " },
      { t: '"Mainnet"', c: "string-err" },
    ],
    [{ t: "  ✗ Type '\"Mainnet\"' is not", c: "error" }],
    [{ t: "    assignable to type 'Chain'.", c: "error" }],
  ];
  return (
    <div className="px-5 pb-5 pt-2 sm:px-7 sm:pb-7">
      <CodeWindow filename="chains.ts" lines={lines} size="sm" />
    </div>
  );
}

function PaletteVisual() {
  return (
    <div className="flex h-24 items-end gap-1.5 px-5 pb-5 sm:h-28 sm:px-7 sm:pb-7">
      {[40, 60, 80, 70, 90, 55].map((h, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="flex-1 rounded-t-md"
          style={{
            height: `${h}%`,
            background: `hsl(var(--primary) / ${0.22 + i * 0.13})`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Source → forwarder → destination, with a "one signature" caption.
 */
function FlowVisual() {
  return (
    <div className="relative flex h-auto items-center justify-between gap-2 px-5 pb-16 sm:h-auto sm:gap-3 sm:px-7 sm:pb-12">
      <FlowNode label="Source" tone="primary" />
      <FlowArrow />
      <FlowNode label="Forwarder" tone="muted" />
      <FlowArrow />
      <FlowNode label="Destination" tone="primary" />

      <span className="absolute bottom-5 sm:bottom-0 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.15em] text-foreground/70">
        one signature
      </span>
    </div>
  );
}

function FlowNode({
  label,
  tone,
}: {
  label: string;
  tone: "primary" | "muted";
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-full font-display text-sm font-semibold",
          tone === "primary"
            ? "border border-primary/40 bg-primary/15 text-primary"
            : "border border-border bg-background/70 text-foreground/70",
        )}
      >
        {label[0]}
      </span>
      <span className="font-display text-[10px] uppercase tracking-[0.15em] text-foreground/65">
        {label}
      </span>
    </div>
  );
}

function FlowArrow() {
  return (
    <span
      aria-hidden="true"
      className="h-px flex-1 bg-gradient-to-r from-border via-primary/70 to-border"
    />
  );
}

/**
 * Two stacked surfaces: a small component card and a hook-call slip,
 * suggesting "same engine, two front doors."
 */
function HeadlessVisual() {
  return (
    <div className="relative h-36 px-5 pb-5 pt-2 sm:h-40 sm:px-7 sm:pb-7">
      <div className="absolute left-7 right-7 top-2">
        <div className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-foreground/55">
              {"<WhiskSend />"}
            </span>
            <span className="font-display text-[9px] uppercase tracking-wider text-foreground/40">
              component
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="h-1.5 w-12 rounded-full bg-foreground/40" />
            <span className="ml-auto h-2 w-8 rounded-full bg-primary" />
          </div>
        </div>
      </div>
      <div className="absolute left-14 right-2 top-16">
        <CodeWindow
          size="sm"
          showLineNumbers={false}
          lines={[
            [
              { t: "const", c: "keyword" },
              { t: " { state, actions } =" },
              { t: " " },
              { t: "useWhisk", c: "fn" },
              { t: "()" },
            ],
          ]}
        />
      </div>
    </div>
  );
}

/**
 * A small "pipeline" of resolver chips: input → address → ENS → custom →
 * resolved. With a real-looking code line below.
 */
function ResolverPipelineVisual() {
  const stops = [
    { label: "input", tone: "muted" as const },
    { label: "address", tone: "primary" as const },
    { label: "ENS", tone: "primary" as const },
    { label: "custom", tone: "primary" as const, dashed: true },
    { label: "match", tone: "muted" as const },
  ];
  return (
    <div className="px-5 pb-6 pt-2 sm:px-7 sm:pb-7">
      <div className="flex flex-wrap items-center gap-1.5">
        {stops.map((s, i) => (
          <Fragment key={s.label}>
            <span
              className={cn(
                "inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 font-display text-[10.5px] font-medium tracking-tight sm:h-8 sm:px-3 sm:text-[11px]",
                s.tone === "primary"
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-background/70 text-foreground/70",
                s.dashed && "border-dashed",
              )}
            >
              {s.label}
            </span>
            {i < stops.length - 1 ? (
              <span
                aria-hidden="true"
                className="hidden h-px flex-1 bg-gradient-to-r from-border to-primary/50 sm:block"
              />
            ) : null}
          </Fragment>
        ))}
      </div>

      <div className="mt-8">
        <CodeWindow
          size="sm"
          showLineNumbers={false}
          lines={[
            [
              { t: "composeResolvers", c: "fn" },
              { t: "([", c: "bracket" },
              { t: " " },
              { t: "addressResolver", c: "string" },
              { t: ",", c: "bracket" },
              { t: " " },
              { t: "ensResolver", c: "string" },
              { t: ",", c: "bracket" },
              { t: " " },
              { t: "lensResolver", c: "string" },
              { t: "])", c: "bracket" },
            ],
          ]}
        />
      </div>
    </div>
  );
}
