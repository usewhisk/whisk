import { describe, expect, it } from "vitest";
import { formatUsdcAmount, parseUsdcAmount, USDC_DECIMALS } from "./amount.js";
import { ConfigError } from "../errors/errors.js";

describe("parseUsdcAmount", () => {
  it("parses whole numbers", () => {
    expect(parseUsdcAmount("1")).toBe(1_000_000n);
    expect(parseUsdcAmount("25")).toBe(25_000_000n);
  });

  it("parses fractional amounts at full precision", () => {
    expect(parseUsdcAmount("1.5")).toBe(1_500_000n);
    expect(parseUsdcAmount("0.000001")).toBe(1n);
  });

  it("pads short fractions to USDC_DECIMALS", () => {
    expect(parseUsdcAmount("1.5")).toBe(1_500_000n);
  });

  it("truncates fractions beyond USDC_DECIMALS (does not round)", () => {
    expect(parseUsdcAmount("1.0000009")).toBe(1_000_000n);
    expect(parseUsdcAmount("0.1234567")).toBe(123_456n);
  });

  it("rejects empty / whitespace", () => {
    expect(() => parseUsdcAmount("")).toThrow(ConfigError);
    expect(() => parseUsdcAmount("   ")).toThrow(ConfigError);
  });

  it("rejects sign characters and scientific notation", () => {
    expect(() => parseUsdcAmount("-1")).toThrow(ConfigError);
    expect(() => parseUsdcAmount("+1")).toThrow(ConfigError);
    expect(() => parseUsdcAmount("1e3")).toThrow(ConfigError);
  });

  it("rejects zero and negatives via the >0 guard", () => {
    expect(() => parseUsdcAmount("0")).toThrow(ConfigError);
    expect(() => parseUsdcAmount("0.0")).toThrow(ConfigError);
  });

  it("rejects garbage", () => {
    expect(() => parseUsdcAmount("abc")).toThrow(ConfigError);
    expect(() => parseUsdcAmount("1.2.3")).toThrow(ConfigError);
  });

  it("trims leading/trailing whitespace", () => {
    expect(parseUsdcAmount("  1.5  ")).toBe(1_500_000n);
  });

  it("USDC_DECIMALS is 6", () => {
    expect(USDC_DECIMALS).toBe(6);
  });
});

describe("formatUsdcAmount", () => {
  it("formats whole numbers without a fractional part", () => {
    expect(formatUsdcAmount(1_000_000n)).toBe("1");
    expect(formatUsdcAmount(25_000_000n)).toBe("25");
  });

  it("formats fractions and strips trailing zeros", () => {
    expect(formatUsdcAmount(1_500_000n)).toBe("1.5");
    expect(formatUsdcAmount(1_230_000n)).toBe("1.23");
  });

  it("handles dust", () => {
    expect(formatUsdcAmount(1n)).toBe("0.000001");
  });

  it("handles zero", () => {
    expect(formatUsdcAmount(0n)).toBe("0");
  });

  it("rejects negatives", () => {
    expect(() => formatUsdcAmount(-1n)).toThrow(ConfigError);
  });

  it("round-trips with parseUsdcAmount", () => {
    const cases = ["1", "1.5", "25", "0.000001", "12345.6789"];
    for (const c of cases) {
      expect(formatUsdcAmount(parseUsdcAmount(c))).toBe(
        c.replace(/\.?0+$/, ""),
      );
    }
  });
});
