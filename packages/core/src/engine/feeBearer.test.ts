/**
 * `feeBearer` defaulting — verifies the engine resolves the public default
 * to `"sender"` and that the resolved config reflects what the engine will
 * actually apply on a bridge.
 */
import { describe, expect, it, vi } from "vitest";
import type { BurnFeeTier } from "@usewhisk/cctp";

const FAST_TIER: BurnFeeTier = {
  finalityThreshold: 1000,
  minimumFee: 1.3,
  forwardFee: { low: 100_000, med: 250_000, high: 500_000 },
};

vi.mock("@usewhisk/cctp", async () => {
  const actual =
    await vi.importActual<typeof import("@usewhisk/cctp")>("@usewhisk/cctp");
  return {
    ...actual,
    getBurnFees: vi.fn(async () => [FAST_TIER]),
  };
});

const { createWhisk } = await import("./createWhisk.js");
const { DEFAULT_FEE_BEARER } = await import("../types/fee.js");

const SENDER = "0x0000000000000000000000000000000000000010" as `0x${string}`;
const RECIPIENT = "0x0000000000000000000000000000000000000020";

const adapter = {
  kind: "evm" as const,
  address: SENDER,
  async getChainId() {
    return 8453;
  },
  async switchChain() {},
  async sendCalls() {
    return { hashes: [] };
  },
  async waitForReceipt() {
    return { status: "success" as const, blockNumber: 1n };
  },
};

describe("feeBearer defaulting", () => {
  it("public default is 'sender'", () => {
    expect(DEFAULT_FEE_BEARER).toBe("sender");
  });

  it("createWhisk resolves feeBearer to 'sender' when omitted", () => {
    const engine = createWhisk({ chains: ["Base"] });
    expect(engine.config.feeBearer).toBe("sender");
  });

  it("createWhisk preserves an explicit 'receiver' setting", () => {
    const engine = createWhisk({ chains: ["Base"], feeBearer: "receiver" });
    expect(engine.config.feeBearer).toBe("receiver");
  });

  it("a bridge quote with default config grosses up amountIn so the recipient nets the requested amount", async () => {
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "25",
      adapter,
    });
    expect(quote.amountOut).toBe("25");
    expect(Number(quote.amountIn)).toBeGreaterThan(25);
  });

  it("a bridge quote with feeBearer='receiver' debits the requested amount and shrinks amountOut", async () => {
    const engine = createWhisk({
      chains: ["Base", "Arbitrum"],
      feeBearer: "receiver",
    });
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "25",
      adapter,
    });
    expect(quote.amountIn).toBe("25");
    expect(Number(quote.amountOut)).toBeLessThan(25);
  });
});
