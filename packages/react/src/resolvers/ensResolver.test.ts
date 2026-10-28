import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import type { Chain } from "@usewhisk/core";
import { createEnsResolver } from "./ensResolver.js";

const ETH_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

// A name that has only an Ethereum address, like most ENS names.
function ethOnlyClient() {
  const getEnsAddress = vi.fn(
    async (args: { coinType?: bigint }): Promise<string | null> =>
      args.coinType === undefined || args.coinType === 60n ? ETH_ADDRESS : null,
  );
  const client = { getEnsAddress } as Pick<
    PublicClient,
    "getEnsAddress"
  > as PublicClient;
  return { client, getEnsAddress };
}

async function resolveFor(chain: Chain) {
  const { client, getEnsAddress } = ethOnlyClient();
  const resolver = createEnsResolver({ client });
  const result = await resolver.resolve("vitalik.eth", { chain });
  return { result, getEnsAddress };
}

describe("createEnsResolver destinations without an ENS coin type", () => {
  it("does not hand a Starknet destination the name's Ethereum address", async () => {
    const { result } = await resolveFor("Starknet");
    expect(result).toBeNull();
  });

  it("does not hand a Starknet Sepolia destination the name's Ethereum address", async () => {
    const { result } = await resolveFor("Starknet_Sepolia");
    expect(result).toBeNull();
  });

  it("does not look the name up at all for Starknet", async () => {
    const { getEnsAddress } = await resolveFor("Starknet");
    expect(getEnsAddress).not.toHaveBeenCalled();
  });

  it("returns nothing for a Stellar destination", async () => {
    const { result } = await resolveFor("Stellar");
    expect(result).toBeNull();
  });

  it("still resolves an EVM destination through the Ethereum fallback", async () => {
    const { result } = await resolveFor("Base");
    expect(result).toEqual({ address: ETH_ADDRESS, chain: "Base" });
  });
});
