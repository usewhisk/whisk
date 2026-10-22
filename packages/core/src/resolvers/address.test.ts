import { describe, expect, it } from "vitest";
import { addressResolver } from "./address.js";

const EVM_ADDR = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1";
const SOL_ADDR = "5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU2Hxw";

describe("addressResolver — matches()", () => {
  it("matches EVM hex addresses", () => {
    expect(addressResolver.matches(EVM_ADDR)).toBe(true);
  });

  it("matches Solana base58 addresses", () => {
    expect(addressResolver.matches(SOL_ADDR)).toBe(true);
  });

  it("trims whitespace before matching", () => {
    expect(addressResolver.matches(`  ${EVM_ADDR}  `)).toBe(true);
  });

  it("rejects ENS-style names", () => {
    expect(addressResolver.matches("alice.eth")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(addressResolver.matches("")).toBe(false);
  });
});

describe("addressResolver — resolve()", () => {
  it("returns the EVM address on an EVM chain", async () => {
    const result = await addressResolver.resolve(EVM_ADDR, {
      chain: "Arc_Testnet",
    });
    expect(result).toEqual({ address: EVM_ADDR, chain: "Arc_Testnet" });
  });

  it("returns the Solana address on a Solana chain", async () => {
    const result = await addressResolver.resolve(SOL_ADDR, {
      chain: "Solana_Devnet",
    });
    expect(result).toEqual({ address: SOL_ADDR, chain: "Solana_Devnet" });
  });

  it("returns null when an EVM address is sent to a Solana chain", async () => {
    const result = await addressResolver.resolve(EVM_ADDR, {
      chain: "Solana_Devnet",
    });
    expect(result).toBeNull();
  });

  it("returns null when a Solana address is sent to an EVM chain", async () => {
    const result = await addressResolver.resolve(SOL_ADDR, {
      chain: "Arc_Testnet",
    });
    expect(result).toBeNull();
  });
});

describe("addressResolver on every ecosystem (#65)", () => {
  const STELLAR_G = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  const STARKNET_FELT =
    "0x4db7926c64f1f32a840f3fa95cb551f3801a3600bae87af87807a54dce12fe8";
  const STARKNET_SHORT = "0x1234";

  it("matches Stellar strkeys and Starknet felts as well as EVM and Solana", () => {
    expect(addressResolver.matches(STELLAR_G)).toBe(true);
    expect(addressResolver.matches(STARKNET_FELT)).toBe(true);
    expect(addressResolver.matches(STARKNET_SHORT)).toBe(true);
  });

  it("resolves them on their own chains", async () => {
    await expect(
      addressResolver.resolve(STELLAR_G, { chain: "Stellar" }),
    ).resolves.toEqual({ address: STELLAR_G, chain: "Stellar" });
    await expect(
      addressResolver.resolve(STARKNET_SHORT, { chain: "Starknet" }),
    ).resolves.toEqual({ address: STARKNET_SHORT, chain: "Starknet" });
  });

  it("does not match text that is no address at all", () => {
    expect(addressResolver.matches("alice.eth")).toBe(false);
    expect(addressResolver.matches("not an address")).toBe(false);
  });
});
