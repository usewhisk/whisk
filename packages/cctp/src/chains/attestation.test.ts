import { describe, expect, it } from "vitest";
import { CHAINS } from "./registry.js";
import { attestationSeconds } from "./attestation.js";

describe("attestationSeconds", () => {
  it.each(CHAINS.map((c) => [c.id, c] as const))(
    "has Circle's Standard time for %s, and a Fast time only where Fast is offered",
    (_id, chain) => {
      const standard = attestationSeconds(chain, "standard");
      expect(standard.min).toBeGreaterThan(0);
      expect(standard.max).toBeGreaterThanOrEqual(standard.min);
      if (chain.capabilities.fastSource) {
        expect(attestationSeconds(chain, "fast").max).toBeLessThan(60);
      } else {
        expect(() => attestationSeconds(chain, "fast")).toThrow();
      }
    },
  );

  it("matches Circle's published times", () => {
    const byId = (id: string) => CHAINS.find((c) => c.id === id)!;
    expect(attestationSeconds(byId("Arc"), "standard")).toEqual({
      min: 0.5,
      max: 0.5,
    });
    expect(attestationSeconds(byId("Base"), "standard")).toEqual({
      min: 900,
      max: 1140,
    });
    expect(attestationSeconds(byId("Linea"), "standard")).toEqual({
      min: 21_600,
      max: 115_200,
    });
    expect(attestationSeconds(byId("Ethereum_Sepolia"), "fast")).toEqual({
      min: 20,
      max: 20,
    });
  });
});
