import { describe, expect, it } from "vitest";
import {
  InvalidAddressError,
  InvalidBytes32Error,
  fromBytes32,
  isAddress,
  toBytes32,
  tryFromBytes32,
} from "./index.js";

describe("toBytes32", () => {
  it("left-pads a 20-byte address to 32 bytes", () => {
    expect(toBytes32("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")).toBe(
      "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    );
  });

  it("preserves all 40 hex chars (lowercased)", () => {
    const out = toBytes32("0xDEADBEEFdeadbeefdeadbeefdeadbeefdeadbeef");
    expect(out).toBe(
      "0x000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    );
    expect(out).toHaveLength(66);
  });

  it("throws on missing 0x prefix", () => {
    expect(() => toBytes32("A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")).toThrow(
      InvalidAddressError,
    );
  });

  it("throws on too-short input", () => {
    expect(() => toBytes32("0xdeadbeef")).toThrow(InvalidAddressError);
  });

  it("throws on too-long input", () => {
    expect(() =>
      toBytes32("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB4800"),
    ).toThrow(InvalidAddressError);
  });

  it("throws on non-hex characters", () => {
    expect(() =>
      toBytes32("0xZZb86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
    ).toThrow(InvalidAddressError);
  });
});

describe("fromBytes32", () => {
  it("strips the zero pad and returns a 20-byte address", () => {
    expect(
      fromBytes32(
        "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      ),
    ).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
  });

  it("is case-insensitive on input", () => {
    expect(
      fromBytes32(
        "0x000000000000000000000000A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      ),
    ).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
  });

  it("rejects bytes32 with non-zero upper 12 bytes (non-EVM)", () => {
    expect(() =>
      fromBytes32(
        "0x010000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      ),
    ).toThrow(/non-zero upper/);
  });

  it("rejects wrong-length input", () => {
    expect(() => fromBytes32("0xdeadbeef")).toThrow(InvalidBytes32Error);
  });
});

describe("tryFromBytes32", () => {
  it("returns address on valid input", () => {
    expect(
      tryFromBytes32(
        "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      ),
    ).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
  });

  it("returns undefined on bad input", () => {
    expect(tryFromBytes32("0xdeadbeef")).toBeUndefined();
    expect(
      tryFromBytes32(
        "0x010000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      ),
    ).toBeUndefined();
  });
});

describe("isAddress", () => {
  it("accepts a checksummed address", () => {
    expect(isAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")).toBe(true);
  });
  it("accepts a lowercase address", () => {
    expect(isAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48")).toBe(true);
  });
  it("rejects non-hex input", () => {
    expect(isAddress("0xZZb86991c6218b36c1d19d4a2e9eb0ce3606eb48")).toBe(false);
    expect(isAddress("hello")).toBe(false);
    expect(isAddress("0xdeadbeef")).toBe(false);
  });
});

describe("round-trip toBytes32/fromBytes32", () => {
  it("evm address survives the loop (lowercased)", () => {
    const original = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const padded = toBytes32(original);
    const stripped = fromBytes32(padded);
    expect(stripped).toBe(original.toLowerCase());
  });
});
