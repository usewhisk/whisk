import { describe, expect, it, vi } from "vitest";
import type { Resolver } from "@usewhisk/core";

vi.mock("./ensResolver.js", () => {
  const fake = (ens: string): Resolver => ({
    name: `ens-${ens}`,
    matches: (input) => input.endsWith(".eth"),
    resolve: async (_input, ctx) => ({
      address: ens === "sepolia" ? "0xsepolia" : "0xmainnet",
      chain: ctx.chain,
    }),
  });
  return {
    createEnsResolver: (opts: { chain?: string } = {}) =>
      fake(opts.chain ?? "mainnet"),
    ensResolver: fake("mainnet"),
    sepoliaEnsResolver: fake("sepolia"),
    DEFAULT_ENS_RPC_URLS: [],
    DEFAULT_ENS_SEPOLIA_RPC_URLS: [],
  };
});

const { createDefaultResolver } = await import("./index.js");

describe("createDefaultResolver", () => {
  it("looks up ENS on Sepolia for a testnet destination", async () => {
    const result = await createDefaultResolver().resolve("whisk.eth", {
      chain: "Base_Sepolia",
    });
    expect(result?.address).toBe("0xsepolia");
  });

  it("looks up ENS on mainnet for a mainnet destination", async () => {
    const result = await createDefaultResolver().resolve("whisk.eth", {
      chain: "Base",
    });
    expect(result?.address).toBe("0xmainnet");
  });
});
