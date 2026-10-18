import { describe, expect, it } from "vitest";
import {
  Arc,
  ArcTestnet,
  Base,
  BaseSepolia,
  CHAINS,
  Edge,
  MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  SolanaDevnet,
  Stellar,
  StellarTestnet,
  StarknetSepolia,
  TOKEN_MESSENGER_V2_EVM_MAINNET,
  TOKEN_MESSENGER_V2_EVM_TESTNET,
  UnknownChainError,
  chainByDomain,
  chainByEvmChainId,
  chainsByNetwork,
  explorerAddressUrl,
  explorerTxUrl,
  getChain,
  isChainId,
  isEvmChain,
  tryChainByEvmChainId,
  type CctpChain,
  type ChainId,
} from "./index.js";

const ALL: readonly CctpChain[] = CHAINS;

describe("registry shape", () => {
  it("lists 28 chains on each network", () => {
    expect(chainsByNetwork("mainnet")).toHaveLength(28);
    expect(chainsByNetwork("testnet")).toHaveLength(28);
  });

  it("pairs every mainnet with a testnet on the same domain and ecosystem", () => {
    const testnets = chainsByNetwork("testnet");
    for (const main of chainsByNetwork("mainnet")) {
      const test = testnets.find((t) => t.cctpDomain === main.cctpDomain);
      expect(test?.ecosystem, main.id).toBe(main.ecosystem);
    }
  });

  it("has unique ids, EVM chain ids, and domains per network", () => {
    const evm = ALL.filter(isEvmChain);
    expect(new Set(ALL.map((c) => c.id)).size).toBe(ALL.length);
    expect(new Set(evm.map((c) => c.evmChainId)).size).toBe(evm.length);
    expect(new Set(ALL.map((c) => `${c.cctpDomain}:${c.network}`)).size).toBe(
      ALL.length,
    );
  });

  it("leaves out BNB, Noble, Sui and Aptos", () => {
    expect(ALL.map((c) => c.cctpDomain)).not.toContain(17);
    for (const domain of [4, 8, 9]) {
      expect(ALL.map((c) => c.cctpDomain)).not.toContain(domain);
    }
  });

  it("gives USDC 7 decimals on Stellar and 6 everywhere else", () => {
    for (const c of ALL) {
      expect(c.usdcDecimals, c.id).toBe(c.ecosystem === "stellar" ? 7 : 6);
    }
  });

  it("uses the shared EVM contracts everywhere except EDGE mainnet", () => {
    for (const c of ALL.filter(isEvmChain)) {
      if (c.id === Edge.id) continue;
      const mainnet = c.network === "mainnet";
      expect(c.tokenMessenger, c.id).toBe(
        mainnet
          ? TOKEN_MESSENGER_V2_EVM_MAINNET
          : TOKEN_MESSENGER_V2_EVM_TESTNET,
      );
      expect(c.messageTransmitter, c.id).toBe(
        mainnet
          ? MESSAGE_TRANSMITTER_V2_EVM_MAINNET
          : MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
      );
    }
    expect(Edge.tokenMessenger).toBe(
      "0x98706A006bc632Df31CAdFCBD43F38887ce2ca5c",
    );
    expect(Edge.messageTransmitter).toBe(
      "0x5b61381Fc9e58E70EfC13a4A97516997019198ee",
    );
  });

  it("derives the Stellar USDC contracts Circle publishes", () => {
    expect(Stellar.usdc).toBe(
      "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    );
    expect(StellarTestnet.usdc).toBe(
      "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    );
  });

  it("pays Arc gas in 18-decimal USDC", () => {
    expect(Arc.nativeCurrency).toEqual({ symbol: "USDC", decimals: 18 });
    expect(ArcTestnet.evmChainId).toBe(5_042_002);
    expect(ArcTestnet.cctpDomain).toBe(26);
  });

  it("offers no Forwarding to Stellar, Starknet and six EVM chains", () => {
    const noForwarding = ALL.filter(
      (c) => c.network === "mainnet" && !c.capabilities.forwardingDestination,
    ).map((c) => c.id);
    expect(noForwarding.sort()).toEqual(
      [
        "Cronos",
        "Injective",
        "Morph",
        "Pharos",
        "Plasma",
        "Starknet",
        "Stellar",
        "X_Layer",
      ].sort(),
    );
  });

  it("gives every chain an https RPC and explorer", () => {
    for (const c of ALL) {
      expect(c.defaultRpcUrls.length, c.id).toBeGreaterThan(0);
      for (const url of [...c.defaultRpcUrls, c.explorerUrl]) {
        expect(url, c.id).toMatch(/^https:\/\/[^\s]+[^/]$/);
      }
    }
  });
});

describe("lookups", () => {
  it("finds a chain by its App Kit id", () => {
    expect(getChain("Base_Sepolia")).toBe(BaseSepolia);
    expect(isChainId("Arc")).toBe(true);
    expect(isChainId("BaseSepolia")).toBe(false);
  });

  it("throws UnknownChainError for an id outside the registry", () => {
    expect(() => getChain("Nope" as ChainId)).toThrow(UnknownChainError);
  });

  it("finds EVM chains by chain id", () => {
    expect(chainByEvmChainId(8453)).toBe(Base);
    expect(chainByEvmChainId(5042)).toBe(Arc);
    expect(() => chainByEvmChainId(999_999_999)).toThrow(UnknownChainError);
    expect(tryChainByEvmChainId(999_999_999)).toBeUndefined();
  });

  it("tells mainnet from testnet on a shared domain", () => {
    expect(chainByDomain(26, "mainnet")).toBe(Arc);
    expect(chainByDomain(26, "testnet")).toBe(ArcTestnet);
    expect(() => chainByDomain(17, "mainnet")).toThrow(UnknownChainError);
  });
});

describe("explorer URLs", () => {
  it("builds tx and address links", () => {
    expect(explorerTxUrl(Base, "0xabc")).toBe("https://basescan.org/tx/0xabc");
    expect(explorerAddressUrl(Base, "0xdef")).toBe(
      "https://basescan.org/address/0xdef",
    );
  });

  it("adds the cluster to Solana devnet links", () => {
    expect(explorerTxUrl(SolanaDevnet, "sig")).toBe(
      "https://explorer.solana.com/tx/sig?cluster=devnet",
    );
  });

  it("uses account and contract paths where the explorer needs them", () => {
    expect(explorerAddressUrl(StellarTestnet, "GABC")).toBe(
      "https://stellar.expert/explorer/testnet/account/GABC",
    );
    expect(explorerAddressUrl(StellarTestnet, "CABC")).toBe(
      "https://stellar.expert/explorer/testnet/contract/CABC",
    );
    expect(explorerAddressUrl(StarknetSepolia, "0x1")).toBe(
      "https://sepolia.voyager.online/contract/0x1",
    );
  });
});
