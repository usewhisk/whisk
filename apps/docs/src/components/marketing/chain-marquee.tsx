"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ComponentType, SVGAttributes } from "react";
import {
  NetworkArbitrumOne,
  NetworkArc,
  NetworkAvalanche,
  NetworkBase,
  NetworkCodex,
  NetworkEthereum,
  NetworkHyperEvm,
  NetworkInjective,
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
  NetworkXdc,
} from "@web3icons/react";
import { FramedSection } from "./framed-section";

/**
 * Auto-scrolling marquee of the chains Whisk routes USDC across. The list
 * mirrors the mainnet chains CCTP V2 reaches. Whisk runs on the matching
 * testnet for each today, with mainnet behind the gate. Doubled content + a linear `x` translate gives
 * a seamless infinite loop.
 *
 * Reduced-motion users get a static, paginated grid instead.
 */

type Web3Icon = ComponentType<
  SVGAttributes<SVGSVGElement> & {
    variant?: "branded" | "mono" | "background";
    size?: number | string;
  }
>;

const CHAINS: Array<{ name: string; Icon: Web3Icon }> = [
  { name: "Arc", Icon: NetworkArc },
  { name: "Arbitrum", Icon: NetworkArbitrumOne },
  { name: "Avalanche", Icon: NetworkAvalanche },
  { name: "Base", Icon: NetworkBase },
  { name: "Codex", Icon: NetworkCodex },
  { name: "Ethereum", Icon: NetworkEthereum },
  { name: "HyperEVM", Icon: NetworkHyperEvm },
  { name: "Injective", Icon: NetworkInjective },
  { name: "Ink", Icon: NetworkInk },
  { name: "Linea", Icon: NetworkLinea },
  { name: "Monad", Icon: NetworkMonad },
  { name: "Optimism", Icon: NetworkOptimism },
  { name: "Plume", Icon: NetworkPlume },
  { name: "Polygon", Icon: NetworkPolygon },
  { name: "Sei", Icon: NetworkSeiNetwork },
  { name: "Solana", Icon: NetworkSolana },
  { name: "Sonic", Icon: NetworkSonic },
  { name: "Unichain", Icon: NetworkUnichain },
  { name: "World Chain", Icon: NetworkWorld },
  { name: "XDC", Icon: NetworkXdc },
];

export function ChainMarquee({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <FramedSection className={className} innerClassName="py-8">
        <p className="mb-4 text-center font-display text-xs font-medium uppercase tracking-[0.15em] text-primary/90">
          Routes USDC across these chains
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {CHAINS.map(({ name, Icon }) => (
            <ChainChip key={name} name={name} Icon={Icon} />
          ))}
        </div>
      </FramedSection>
    );
  }

  return (
    <FramedSection className={className} innerClassName="py-8">
      <p className="mb-5 text-center font-display text-xs font-medium uppercase tracking-[0.15em] text-primary/90">
        Routes USDC across these chains
      </p>

      <div
        className="relative overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
        }}
      >
        <motion.div
          className="flex w-max gap-3 will-change-transform"
          animate={{ x: ["0%", "-50%"] }}
          transition={{
            duration: 48,
            ease: "linear",
            repeat: Infinity,
          }}
        >
          {[...CHAINS, ...CHAINS].map(({ name, Icon }, i) => (
            <ChainChip key={`${name}-${i}`} name={name} Icon={Icon} />
          ))}
        </motion.div>
      </div>
    </FramedSection>
  );
}

function ChainChip({ name, Icon }: { name: string; Icon: Web3Icon }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-3 rounded-full border border-border/70 bg-card/80 py-1.5 pl-1.5 pr-5 text-[15px] font-medium text-foreground shadow-sm backdrop-blur-sm">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background/90 ring-1 ring-border/50">
        <Icon variant="branded" size={22} aria-hidden="true" />
      </span>
      {name}
    </span>
  );
}
