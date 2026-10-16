/**
 * Live integration test against the Iris sandbox.
 *
 * Hits real network. Skipped by default. Run with:
 *   IRIS_LIVE=1 pnpm --filter @usewhisk/cctp test
 *
 * Use when verifying a chain registry change touched the right
 * domains, or after a bump of Iris-side response shapes.
 */
import { describe, expect, it } from "vitest";
import { getBurnFees, pickFeeTier } from "../iris/index.js";

const LIVE = process.env["IRIS_LIVE"] === "1";

describe.skipIf(!LIVE)("Iris sandbox (live)", () => {
  it("getBurnFees(Base Sepolia → Arbitrum Sepolia, ?forward=true)", async () => {
    const tiers = await getBurnFees("testnet", 6, 3);
    expect(tiers.length).toBeGreaterThan(0);
    const fast = pickFeeTier(tiers);
    expect(fast.minimumFee).toBeGreaterThanOrEqual(0);
    if (fast.forwardFee) {
      expect(fast.forwardFee.low).toBeGreaterThan(0);
      expect(fast.forwardFee.med).toBeGreaterThanOrEqual(fast.forwardFee.low);
      expect(fast.forwardFee.high).toBeGreaterThanOrEqual(fast.forwardFee.med);
    }
  });

  it("getBurnFees(Ethereum Sepolia → Avalanche Fuji)", async () => {
    const tiers = await getBurnFees("testnet", 0, 1);
    expect(tiers.length).toBeGreaterThan(0);
  });
});
