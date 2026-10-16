import { describe, expect, it } from "vitest";
import { Base } from "@usewhisk/cctp";
import { buildCustomFee } from "./customFee.js";
import { ConfigError } from "../errors/errors.js";
import { WHISK_TREASURY_ADDRESS } from "../fees/treasury.js";

const MERCHANT = "0x000000000000000000000000000000000000bEEF" as `0x${string}`;

describe("buildCustomFee", () => {
  it("returns null when no policy is set", () => {
    expect(buildCustomFee(undefined, Base)).toBeNull();
  });

  it("returns null when value is empty or zero", () => {
    expect(buildCustomFee({ value: "", recipient: MERCHANT }, Base)).toBeNull();
    expect(
      buildCustomFee({ value: "0", recipient: MERCHANT }, Base),
    ).toBeNull();
  });

  it("returns null when value is not parseable", () => {
    expect(
      buildCustomFee({ value: "abc", recipient: MERCHANT }, Base),
    ).toBeNull();
  });

  it("encodes two USDC transfers: 90% to merchant, 10% to Whisk treasury", () => {
    const fee = buildCustomFee({ value: "1", recipient: MERCHANT }, Base);
    expect(fee).not.toBeNull();
    expect(fee?.totalAmount).toBe(1_000_000n);
    expect(fee?.merchantAmount).toBe(900_000n);
    expect(fee?.whiskAmount).toBe(100_000n);
    expect(fee?.merchantRecipient).toBe(MERCHANT);

    expect(fee?.calls).toHaveLength(2);
    for (const call of fee?.calls ?? []) {
      expect(call.to).toBe(Base.usdc);
      expect(call.value).toBe(0n);
      // ERC-20 transfer selector.
      expect(call.data.startsWith("0xa9059cbb")).toBe(true);
    }
    // The two calls must encode distinct (recipient, amount) pairs.
    expect(fee?.calls[0]?.data).not.toBe(fee?.calls[1]?.data);
  });

  it("falls back to a single merchant transfer when the treasury share rounds to zero", () => {
    const fee = buildCustomFee(
      { value: "0.000005", recipient: MERCHANT },
      Base,
    );
    expect(fee?.calls).toHaveLength(1);
    expect(fee?.whiskAmount).toBe(0n);
    expect(fee?.merchantAmount).toBe(5n);
  });

  it("merchantAmount + whiskAmount equals totalAmount", () => {
    for (const value of ["0.25", "1", "10", "12345.678901"]) {
      const fee = buildCustomFee({ value, recipient: MERCHANT }, Base);
      expect(fee).not.toBeNull();
      expect((fee?.merchantAmount ?? 0n) + (fee?.whiskAmount ?? 0n)).toBe(
        fee?.totalAmount,
      );
    }
  });

  it("encodes the treasury share to the WHISK_TREASURY_ADDRESS", () => {
    const fee = buildCustomFee({ value: "1", recipient: MERCHANT }, Base);
    // The treasury address shows up encoded into the second transfer's calldata.
    const treasuryHex = WHISK_TREASURY_ADDRESS.slice(2).toLowerCase();
    expect(fee?.calls[1]?.data.toLowerCase()).toContain(treasuryHex);
  });

  it("throws ConfigError for an invalid recipient address", () => {
    expect(() =>
      buildCustomFee({ value: "1", recipient: "not-an-address" }, Base),
    ).toThrow(ConfigError);
  });
});
