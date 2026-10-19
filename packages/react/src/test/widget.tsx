import type { ReactNode } from "react";
import { vi } from "vitest";
import type {
  Chain,
  Quote,
  ResolvedRecipient,
  WhiskEngine,
} from "@usewhisk/core";
import { WhiskContext } from "../provider/context.js";
import type { WhiskClientConfig } from "../config/types.js";

export const PAYER = "0x0000000000000000000000000000000000000010";
export const RECIPIENT = "0x0000000000000000000000000000000000000020";

/** A Base to Base quote for `amount` USDC with no fees. */
export function sameChainQuote(amount: string): Quote {
  const subunits = BigInt(Math.round(Number(amount) * 1e6));
  return {
    id: "q1",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    feeMode: "maxFee",
    route: { kind: "send", chain: "Base" },
    recipient: { address: RECIPIENT, chain: "Base" },
    amountIn: amount,
    amountOut: amount,
    amountBurned: amount,
    token: "USDC",
    fees: { total: "0", token: "USDC", entries: [] },
    subunits: {
      requested: subunits,
      amountIn: subunits,
      burnAmount: 0n,
      burnFee: 0n,
      forwarderFee: 0n,
      maxFee: 0n,
      amountOut: subunits,
      customFee: 0n,
    },
  };
}

/** An engine whose every method is a mock; tests set what `send` does. */
export function fakeEngine(): WhiskEngine & {
  send: ReturnType<typeof vi.fn>;
  quote: ReturnType<typeof vi.fn>;
} {
  return {
    config: { chains: ["Base"] },
    resolve: vi.fn(
      async (input: string, chain: Chain): Promise<ResolvedRecipient> => ({
        address: input,
        chain,
      }),
    ),
    quote: vi.fn(async (params: { amount: string }) =>
      sameChainQuote(params.amount),
    ),
    send: vi.fn(),
    refund: vi.fn(),
    inflight: vi.fn(async () => []),
    resume: vi.fn(),
    resumeFromTx: vi.fn(),
  } as unknown as WhiskEngine & {
    send: ReturnType<typeof vi.fn>;
    quote: ReturnType<typeof vi.fn>;
  };
}

export function WithWhisk({
  engine,
  children,
  config = { chains: ["Base"], wallets: [] },
}: {
  engine: WhiskEngine;
  children: ReactNode;
  config?: WhiskClientConfig;
}) {
  return (
    <WhiskContext.Provider value={{ engine, config, theme: "light" }}>
      {children}
    </WhiskContext.Provider>
  );
}
