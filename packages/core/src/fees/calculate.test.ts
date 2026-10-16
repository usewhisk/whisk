import { describe, expect, it } from "vitest";
import {
  buildCustomFeeEntries,
  sumFees,
  sumForwarderFees,
  sumProtocolFees,
} from "./calculate.js";
import type { FeeEntry } from "../types/fee.js";

const MERCHANT = "0xH00000000000000000000000000000000000000h";

describe("buildCustomFeeEntries", () => {
  it("returns an empty list when no policy is configured", () => {
    expect(buildCustomFeeEntries(undefined, "USDC")).toEqual([]);
  });

  it("returns an empty list when value is zero", () => {
    expect(
      buildCustomFeeEntries({ value: "0", recipient: MERCHANT }, "USDC"),
    ).toEqual([]);
  });

  it("returns an empty list when value is malformed", () => {
    expect(
      buildCustomFeeEntries(
        { value: "not-a-number", recipient: MERCHANT },
        "USDC",
      ),
    ).toEqual([]);
  });

  it("splits the fee 90/10 between merchant and the Whisk treasury", async () => {
    const { WHISK_TREASURY_ADDRESS } = await import("./treasury.js");
    const entries = buildCustomFeeEntries(
      { value: "1", recipient: MERCHANT },
      "USDC",
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      kind: "custom",
      amount: "0.9",
      token: "USDC",
      recipient: MERCHANT,
      description: "Merchant fee (90%)",
    });
    expect(entries[1]).toMatchObject({
      kind: "custom",
      amount: "0.1",
      token: "USDC",
      recipient: WHISK_TREASURY_ADDRESS,
      description: "Whisk platform fee (10%)",
    });
  });

  it("merchant + whisk amounts sum exactly to the configured total", () => {
    const entries = buildCustomFeeEntries(
      { value: "1.5", recipient: MERCHANT },
      "USDC",
    );
    const total = entries.reduce((acc, e) => acc + parseFloat(e.amount), 0);
    expect(total).toBeCloseTo(1.5, 6);
  });

  it("formats fee amounts at USDC precision and strips trailing zeros", () => {
    const entries = buildCustomFeeEntries(
      { value: "10", recipient: MERCHANT },
      "USDC",
    );
    expect(entries[0]?.amount).toBe("9");
    expect(entries[1]?.amount).toBe("1");
  });

  it("emits only the merchant entry when the 10% share rounds to zero", () => {
    // 5 subunits → 10% truncates to 0; merchant takes the whole fee.
    const entries = buildCustomFeeEntries(
      { value: "0.000005", recipient: MERCHANT },
      "USDC",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.recipient).toBe(MERCHANT);
  });

  it("ignores `bps` (reserved for Swap)", () => {
    expect(
      buildCustomFeeEntries({ bps: 50, recipient: MERCHANT }, "USDC"),
    ).toEqual([]);
  });
});

describe("sumFees", () => {
  it("totals only entries denominated in the target token", () => {
    const breakdown = sumFees(
      [
        { kind: "protocol", amount: "0.1", token: "USDC" },
        { kind: "provider", amount: "0.2", token: "USDC" },
        { kind: "gas", amount: "0.005", token: "NATIVE" },
      ],
      "USDC",
    );
    expect(breakdown.total).toBe("0.3");
    expect(breakdown.token).toBe("USDC");
    expect(breakdown.entries).toHaveLength(3);
  });

  it("returns zero total when no entries match the token", () => {
    const breakdown = sumFees(
      [{ kind: "gas", amount: "0.01", token: "NATIVE" }],
      "USDC",
    );
    expect(breakdown.total).toBe("0");
  });

  it("returns zero total when entry list is empty", () => {
    const breakdown = sumFees([], "USDC");
    expect(breakdown.total).toBe("0");
    expect(breakdown.entries).toEqual([]);
  });
});

describe("sumProtocolFees", () => {
  const entries: FeeEntry[] = [
    { kind: "provider", amount: "0.0007", token: "USDC" },
    { kind: "forwarder", amount: "2.43", token: "USDC" },
    { kind: "protocol", amount: "0.01", token: "USDC" },
    { kind: "gas", amount: "0.005", token: "NATIVE" },
    { kind: "custom", amount: "0.9", token: "USDC", recipient: MERCHANT },
  ];

  it("sums only the fees deducted from the bridged amount", () => {
    expect(sumProtocolFees(entries, "USDC")).toBeCloseTo(2.4407, 6);
  });

  it("ignores entries denominated in a different token", () => {
    expect(sumProtocolFees(entries, "EURC")).toBe(0);
  });

  it("excludes the merchant `custom` fee", () => {
    expect(sumProtocolFees(entries, "USDC")).not.toBeCloseTo(3.3407, 6);
  });

  it("returns zero for an empty list", () => {
    expect(sumProtocolFees([], "USDC")).toBe(0);
  });
});

describe("sumForwarderFees", () => {
  it("isolates only the forwarder share", () => {
    expect(
      sumForwarderFees(
        [
          { kind: "forwarder", amount: "0.25", token: "USDC" },
          { kind: "protocol", amount: "0.01", token: "USDC" },
        ],
        "USDC",
      ),
    ).toBeCloseTo(0.25, 6);
  });
});
