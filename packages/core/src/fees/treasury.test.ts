import { describe, expect, it } from "vitest";
import {
  BPS_DENOMINATOR,
  WHISK_TREASURY_ADDRESS,
  WHISK_TREASURY_BPS,
  splitCustomFee,
} from "./treasury.js";

describe("splitCustomFee", () => {
  it("splits 1 USDC into 0.9 merchant / 0.1 whisk", () => {
    const { merchant, whisk } = splitCustomFee(1_000_000n);
    expect(merchant).toBe(900_000n);
    expect(whisk).toBe(100_000n);
    expect(merchant + whisk).toBe(1_000_000n);
  });

  it("splits 10 USDC cleanly", () => {
    expect(splitCustomFee(10_000_000n)).toEqual({
      merchant: 9_000_000n,
      whisk: 1_000_000n,
    });
  });

  it("favours the merchant when the split doesn't divide evenly", () => {
    // 5 subunits → 10% = 0 (truncated), merchant takes the whole fee.
    const { merchant, whisk } = splitCustomFee(5n);
    expect(merchant).toBe(5n);
    expect(whisk).toBe(0n);
  });

  it("never returns negative shares", () => {
    expect(splitCustomFee(0n)).toEqual({ merchant: 0n, whisk: 0n });
    expect(splitCustomFee(-1n)).toEqual({ merchant: 0n, whisk: 0n });
  });

  it("shares always sum to the input total", () => {
    for (const total of [1n, 7n, 99n, 1_000n, 999_999n, 12_345_678n]) {
      const { merchant, whisk } = splitCustomFee(total);
      expect(merchant + whisk).toBe(total);
    }
  });

  it("constants are wired correctly", () => {
    expect(WHISK_TREASURY_BPS).toBe(1000n);
    expect(BPS_DENOMINATOR).toBe(10_000n);
    expect(WHISK_TREASURY_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});
