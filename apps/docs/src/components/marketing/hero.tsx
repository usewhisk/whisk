import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WidgetMockup } from "./widget-mockup";
import { FramedSection } from "./framed-section";

/**
 * Above-the-fold hero. Two-column on desktop (copy + mockup), stacked
 * on mobile. The page-level dot-grid backdrop (in globals.css) carries
 * the ambient texture, so this section ships with no extra
 * background SVG of its own.
 */
export function Hero({ className }: { className?: string }) {
  return (
    <FramedSection
      noTop
      className={className}
      innerClassName="grid min-h-[36rem] items-center gap-12 py-24 sm:py-32 md:min-h-[44rem] lg:grid-cols-2 md:py-40 lg:gap-20"
    >
      <div className="flex flex-col items-start lg:pl-12 xl:pl-16 2xl:pl-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/80">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/70" />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Live on testnets
          <span className="text-foreground/40">·</span>
          <span className="text-foreground">Mainnet soon</span>
        </span>

        <h1 className="mt-4 md:mt-6 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
          One widget.{" "}
          <span className="bg-gradient-to-br from-primary via-primary to-foreground bg-clip-text text-transparent">
            Every USDC payment shape.
          </span>
        </h1>

        <p className="mt-5 max-w-xl text-balance text-base text-foreground/75 sm:text-lg">
          Drop <code>{`<WhiskSend />`}</code> into your app and your users can
          send or bridge USDC across any chain CCTP V2 reaches. Wallet connect,
          ENS lookup, and CCTP bridging stay inside the widget so you stay out
          of the plumbing.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/docs/getting-started/install"
            className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Read the docs
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="https://whisk-playground.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Try the playground
          </a>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-sm">
        <WidgetMockup />
      </div>
    </FramedSection>
  );
}
