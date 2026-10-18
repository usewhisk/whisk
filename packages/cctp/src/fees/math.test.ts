import { describe, expect, it } from "vitest";
import { IrisParseError } from "../errors.js";
import type { BurnFeeTier } from "../iris/types.js";
import {
  computeBurnFee,
  computeMaxFee,
  parseFeeBps,
  parseForwarderFee,
  selectForwarderFee,
} from "./index.js";

describe("computeBurnFee", () => {
  it("1.3 bps on 1 USDC", () => {
    expect(computeBurnFee(1_000_000n, 130n)).toBe(130n);
  });

  it("1.3 bps on 100 USDC", () => {
    expect(computeBurnFee(100_000_000n, 130n)).toBe(13_000n);
  });

  it("14 bps on 100 USDC (max protocol rate)", () => {
    expect(computeBurnFee(100_000_000n, 1_400n)).toBe(140_000n);
  });

  it("0 bps (Standard Transfer) yields 0", () => {
    expect(computeBurnFee(1_000_000_000n, 0n)).toBe(0n);
  });

  it("rounds a fractional subunit up", () => {
    expect(computeBurnFee(999_999n, 130n)).toBe(130n);
    expect(computeBurnFee(1n, 1n)).toBe(1n);
  });

  it("rejects negative amount", () => {
    expect(() => computeBurnFee(-1n, 130n)).toThrow(/non-negative/);
  });

  it("rejects a negative rate", () => {
    expect(() => computeBurnFee(1_000_000n, -1n)).toThrow(/non-negative/);
  });
});

describe("parseFeeBps", () => {
  it("reads Iris's basis points as hundredths without a float step", () => {
    expect(parseFeeBps(1.1)).toBe(110n);
    expect(parseFeeBps(1.3)).toBe(130n);
    expect(parseFeeBps(0.07)).toBe(7n);
    expect(parseFeeBps(14)).toBe(1_400n);
    expect(parseFeeBps(0)).toBe(0n);
    expect(parseFeeBps("1.12")).toBe(112n);
  });

  it("rounds a third decimal up", () => {
    expect(parseFeeBps(0.123)).toBe(13n);
    expect(parseFeeBps("1.100")).toBe(110n);
  });

  it.each([-1, Number.NaN, Infinity, 1e-7, "1e2", "", null, undefined, {}])(
    "rejects %s",
    (raw) => {
      expect(() => parseFeeBps(raw)).toThrow(IrisParseError);
    },
  );
});

describe("parseForwarderFee", () => {
  it("reads whole subunits and rounds a fraction up", () => {
    expect(parseForwarderFee(207543)).toBe(207_543n);
    expect(parseForwarderFee(100.4)).toBe(101n);
    expect(() => parseForwarderFee(-5)).toThrow(IrisParseError);
  });
});

describe("selectForwarderFee", () => {
  const tier: BurnFeeTier = {
    finalityThreshold: 1000,
    minimumFee: 130n,
    forwardFee: { low: 206_035n, med: 207_543n, high: 209_052n },
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
    const noForward: BurnFeeTier = {
      finalityThreshold: 1000,
      minimumFee: 130n,
    };
    expect(() => selectForwarderFee(noForward)).toThrow(/forwardFee/);
  });

  it("rejects negative values", () => {
    const bad: BurnFeeTier = {
      finalityThreshold: 1000,
      minimumFee: 0n,
      forwardFee: { low: -1n, med: 100n, high: 200n },
    };
    expect(() => selectForwarderFee(bad, "low")).toThrow();
  });
});

describe("computeMaxFee — Fast + Forwarder", () => {
  const fastTier: BurnFeeTier = {
    finalityThreshold: 1000,
    minimumFee: 130n,
    forwardFee: { low: 206_035n, med: 207_543n, high: 209_052n },
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
    // 207_543 * 1.1 is 228_297.3, rounded up.
    expect(result.forwarderFee).toBe(228_298n);
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
    minimumFee: 0n,
    forwardFee: { low: 206_035n, med: 207_543n, high: 209_052n },
  };

  it("burnFee is 0 when minimumFee is 0", () => {
    const result = computeMaxFee({ amount: 1_000_000_000n, tier: zeroBpsTier });
    expect(result.burnFee).toBe(0n);
    expect(result.maxFee).toBe(result.forwarderFee);
  });
});

describe("computeMaxFee — error cases", () => {
  it("throws when including forwarder but the tier has no forwardFee", () => {
    const tier: BurnFeeTier = { finalityThreshold: 1000, minimumFee: 130n };
    expect(() => computeMaxFee({ amount: 1_000_000n, tier })).toThrow(
      /forwardFee/,
    );
  });

  it("rejects negative bufferBps", () => {
    const tier: BurnFeeTier = {
      finalityThreshold: 1000,
      minimumFee: 130n,
      forwardFee: { low: 100n, med: 200n, high: 300n },
    };
    expect(() =>
      computeMaxFee({
        amount: 1_000_000n,
        tier,
        forwarderBufferBps: -1,
      }),
    ).toThrow(/non-negative/);
    expect(() =>
      computeMaxFee({ amount: 1_000_000n, tier, forwarderBufferBps: 2.5 }),
    ).toThrow(/whole number/);
  });
});

describe("computeMaxFee protocol fee buffer and floor", () => {
  const tier: BurnFeeTier = {
    finalityThreshold: 1000,
    minimumFee: 130n,
    forwardFee: { low: 206_035n, med: 207_543n, high: 209_052n },
  };

  it("buffers the protocol fee but not the forwarder fee", () => {
    const result = computeMaxFee({
      amount: 5_000_000n,
      tier,
      forwarderLevel: "high",
      burnFeeBufferBps: 1000,
    });
    expect(result.burnFee).toBe(650n);
    expect(result.forwarderFee).toBe(209_052n);
    expect(result.maxFee).toBe(715n + 209_052n);
  });

  it("rounds the buffered protocol fee up", () => {
    const result = computeMaxFee({
      amount: 3_000_001n,
      tier,
      includeForwarder: false,
      burnFeeBufferBps: 1000,
    });
    // 391 * 1.1 is 430.1.
    expect(result.burnFee).toBe(391n);
    expect(result.maxFee).toBe(431n);
  });

  it("raises the protocol fee to an on-chain minimum", () => {
    const standard: BurnFeeTier = { finalityThreshold: 2000, minimumFee: 0n };
    const result = computeMaxFee({
      amount: 5_000_000n,
      tier: standard,
      includeForwarder: false,
      minBurnFee: 1_000n,
    });
    expect(result.burnFee).toBe(1_000n);
    expect(result.maxFee).toBe(1_000n);
  });
});
