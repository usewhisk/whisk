import { describe, expect, it } from "vitest";
import type { BurnFeeTier } from "../iris/types.js";
import { computeBurnFee, computeMaxFee, selectForwarderFee } from "./index.js";

describe("computeBurnFee", () => {
  it("1.3 bps on 1 USDC", () => {
    expect(computeBurnFee(1_000_000n, 1.3)).toBe(130n);
  });

  it("1.3 bps on 100 USDC", () => {
    expect(computeBurnFee(100_000_000n, 1.3)).toBe(13_000n);
  });

  it("14 bps on 100 USDC (max protocol rate)", () => {
    expect(computeBurnFee(100_000_000n, 14)).toBe(140_000n);
  });

  it("0 bps (Standard Transfer) yields 0", () => {
    expect(computeBurnFee(1_000_000_000n, 0)).toBe(0n);
  });

  it("fractional bps is ceil-rounded (caller never under-quotes)", () => {
    // 0.123 bps × 1 USDC = 12.3 subunits → round up to 13
    expect(computeBurnFee(1_000_000n, 0.123)).toBe(13n);
  });

  it("rejects negative amount", () => {
    expect(() => computeBurnFee(-1n, 1.3)).toThrow(/non-negative/);
  });

  it("rejects negative bps", () => {
    expect(() => computeBurnFee(1_000_000n, -1)).toThrow(/non-negative/);
  });
});

describe("selectForwarderFee", () => {
  const tier: BurnFeeTier = {
    finalityThreshold: 1000,
    minimumFee: 1.3,
    forwardFee: { low: 206035, med: 207543, high: 209052 },
  };

  it("returns the requested level as bigint", () => {
    expect(selectForwarderFee(tier, "low")).toBe(206035n);
    expect(selectForwarderFee(tier, "med")).toBe(207543n);
    expect(selectForwarderFee(tier, "high")).toBe(209052n);
  });

  it("defaults to med", () => {
    expect(selectForwarderFee(tier)).toBe(207543n);
  });

  it("throws when tier has no forwardFee", () => {
    const noForward: BurnFeeTier = { finalityThreshold: 1000, minimumFee: 1.3 };
    expect(() => selectForwarderFee(noForward)).toThrow(/forwardFee/);
  });

  it("rejects negative values", () => {
    const bad: BurnFeeTier = {
      finalityThreshold: 1000,
      minimumFee: 0,
      forwardFee: { low: -1, med: 100, high: 200 },
    };
    expect(() => selectForwarderFee(bad, "low")).toThrow();
  });
});

describe("computeMaxFee — Fast + Forwarder", () => {
  const fastTier: BurnFeeTier = {
    finalityThreshold: 1000,
    minimumFee: 1.3,
    forwardFee: { low: 206035, med: 207543, high: 209052 },
  };

  it("burnFee + forwarderFee on 5 USDC at default med tier", () => {
    const result = computeMaxFee({
      amount: 5_000_000n, // 5 USDC
      tier: fastTier,
    });
    expect(result.burnFee).toBe(650n); // 5_000_000 * 130 / 1_000_000
    expect(result.forwarderFee).toBe(207_543n);
    expect(result.maxFee).toBe(208_193n);
  });

  it("uses the high tier when requested", () => {
    const result = computeMaxFee({
      amount: 5_000_000n,
      tier: fastTier,
      forwarderLevel: "high",
    });
    expect(result.forwarderFee).toBe(209_052n);
    expect(result.maxFee).toBe(209_702n);
  });

  it("applies a buffer to the forwarder fee", () => {
    const result = computeMaxFee({
      amount: 5_000_000n,
      tier: fastTier,
      forwarderBufferBps: 1000, // +10%
    });
    // 207_543 × 1.1 = 228_297.3 → ceil 228_298 (bigint truncation drops it down again to 228297)
    // The formula is (v × (10000 + bps)) / 10000 = (207543 × 11000) / 10000 = 228297
    expect(result.forwarderFee).toBe(228_297n);
  });

  it("can omit the forwarder fee entirely", () => {
    const result = computeMaxFee({
      amount: 1_000_000n,
      tier: fastTier,
      includeForwarder: false,
    });
    expect(result.forwarderFee).toBe(0n);
    expect(result.maxFee).toBe(result.burnFee);
  });
});

describe("computeMaxFee — zero-bps tier", () => {
  // A Fast tier with `minimumFee: 0` means CCTP charges no protocol
  // fee for the route — the whole `maxFee` is the forwarder fee.
  const zeroBpsTier: BurnFeeTier = {
    finalityThreshold: 1000,
    minimumFee: 0,
    forwardFee: { low: 206035, med: 207543, high: 209052 },
  };

  it("burnFee is 0 when minimumFee is 0", () => {
    const result = computeMaxFee({ amount: 1_000_000_000n, tier: zeroBpsTier });
    expect(result.burnFee).toBe(0n);
    expect(result.maxFee).toBe(result.forwarderFee);
  });
});

describe("computeMaxFee — error cases", () => {
  it("throws when including forwarder but the tier has no forwardFee", () => {
    const tier: BurnFeeTier = { finalityThreshold: 1000, minimumFee: 1.3 };
    expect(() => computeMaxFee({ amount: 1_000_000n, tier })).toThrow(
      /forwardFee/,
    );
  });

  it("rejects negative bufferBps", () => {
    const tier: BurnFeeTier = {
      finalityThreshold: 1000,
      minimumFee: 1.3,
      forwardFee: { low: 100, med: 200, high: 300 },
    };
    expect(() =>
      computeMaxFee({
        amount: 1_000_000n,
        tier,
        forwarderBufferBps: -1,
      }),
    ).toThrow(/non-negative/);
  });
});
