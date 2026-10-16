import { describe, expect, it } from "vitest";
import { Base, Arbitrum, type BurnFeeTier } from "@usewhisk/cctp";
import { buildBridgeQuote } from "./quote.js";
import { ConfigError } from "../../errors/errors.js";

const FAST_TIER: BurnFeeTier = {
  finalityThreshold: 1000,
  minimumFee: 1.3, // 1.3 bps = 0.013%
  forwardFee: { low: 100_000, med: 250_000, high: 500_000 },
};

const RECIPIENT = "0x0000000000000000000000000000000000000020";

describe("buildBridgeQuote", () => {
  it("rejects identical source and destination", async () => {
    await expect(
      buildBridgeQuote({
        network: "mainnet",
        source: Base,
        destination: Base,
        sourceChain: "Base",
        destinationChain: "Base",
        recipient: { address: RECIPIENT, chain: "Base" },
        amount: "1",
        feeBearer: "sender",
        tier: FAST_TIER,
      }),
    ).rejects.toThrow(ConfigError);
  });

  it("sender mode: recipient nets the requested amount", async () => {
    const result = await buildBridgeQuote({
      network: "mainnet",
      source: Base,
      destination: Arbitrum,
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "10",
      feeBearer: "sender",
      tier: FAST_TIER,
    });
    expect(result.quote.route.kind).toBe("bridge");
    expect(result.quote.amountOut).toBe("10");
    expect(Number(result.quote.amountIn)).toBeGreaterThan(10);
    expect(result.maxFee).toBeGreaterThan(0n);
    expect(result.burnAmount).toBe(10_000_000n + result.maxFee);
  });

  it("receiver mode: sender pays exactly the requested amount", async () => {
    const result = await buildBridgeQuote({
      network: "mainnet",
      source: Base,
      destination: Arbitrum,
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "10",
      feeBearer: "receiver",
      tier: FAST_TIER,
    });
    expect(result.quote.amountIn).toBe("10");
    expect(Number(result.quote.amountOut)).toBeLessThan(10);
    expect(result.burnAmount).toBe(10_000_000n);
  });

  it("receiver mode rejects amounts smaller than the fees", async () => {
    await expect(
      buildBridgeQuote({
        network: "mainnet",
        source: Base,
        destination: Arbitrum,
        sourceChain: "Base",
        destinationChain: "Arbitrum",
        recipient: { address: RECIPIENT, chain: "Arbitrum" },
        amount: "0.0001",
        feeBearer: "receiver",
        tier: FAST_TIER,
      }),
    ).rejects.toThrow(ConfigError);
  });

  it("emits protocol + forwarder fee entries", async () => {
    const result = await buildBridgeQuote({
      network: "mainnet",
      source: Base,
      destination: Arbitrum,
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "100",
      feeBearer: "sender",
      tier: FAST_TIER,
    });
    expect(result.quote.fees.entries).toHaveLength(2);
    expect(result.quote.fees.entries.map((e) => e.kind).sort()).toEqual([
      "forwarder",
      "protocol",
    ]);
  });

  it("with forwarder disabled: only the protocol fee is present", async () => {
    const result = await buildBridgeQuote({
      network: "mainnet",
      source: Base,
      destination: Arbitrum,
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "100",
      feeBearer: "sender",
      useForwarder: false,
      tier: FAST_TIER,
    });
    expect(result.forwarderFee).toBe(0n);
    expect(result.quote.fees.entries.map((e) => e.kind)).toEqual(["protocol"]);
  });

  it("uses the requested forwarder level", async () => {
    const med = await buildBridgeQuote({
      network: "mainnet",
      source: Base,
      destination: Arbitrum,
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "10",
      feeBearer: "sender",
      forwarderLevel: "med",
      tier: FAST_TIER,
    });
    const high = await buildBridgeQuote({
      network: "mainnet",
      source: Base,
      destination: Arbitrum,
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "10",
      feeBearer: "sender",
      forwarderLevel: "high",
      tier: FAST_TIER,
    });
    expect(high.forwarderFee).toBeGreaterThan(med.forwarderFee);
  });
});
