import { describe, expect, it } from "vitest";
import {
  Arbitrum,
  ArbitrumSepolia,
  Base,
  BaseSepolia,
  Ethereum,
  EthereumSepolia,
  Polygon,
  PolygonAmoy,
  UnknownChainError,
  allChains,
  chainsByNetwork,
  chainByDomain,
  chainByEvmChainId,
  explorerAddressUrl,
  explorerTxUrl,
  getChain,
  MAINNET_CHAINS,
  TESTNET_CHAINS,
  tryChainByDomain,
  tryChainByEvmChainId,
  tryGetChain,
} from "./index.js";

describe("registry shape", () => {
  it("includes 10 mainnet chains (9 EVM + Solana)", () => {
    expect(MAINNET_CHAINS).toHaveLength(10);
  });

  it("includes 10 testnet chains, one per mainnet", () => {
    expect(TESTNET_CHAINS).toHaveLength(10);
    for (const mainnet of MAINNET_CHAINS) {
      const testnet = TESTNET_CHAINS.find(
        (c) => c.cctpDomain === mainnet.cctpDomain,
      );
      expect(testnet).toBeDefined();
    }
  });

  it("allChains() returns mainnet + testnet (incl. Solana + Stellar + Starknet)", () => {
    // 10 EVM mainnet + 10 EVM testnet + Solana (2) + Stellar (2) + Starknet (2) = 24
    expect(allChains()).toHaveLength(24);
  });

  it("every EVM chain has a hex USDC address; Solana uses base58; Stellar uses strkey; Starknet uses felt", () => {
    for (const c of allChains()) {
      if (c.ecosystem === "evm") {
        expect(c.usdc).toMatch(/^0x[a-fA-F0-9]{40}$/);
      } else if (c.ecosystem === "solana") {
        expect(c.usdc).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      } else if (c.ecosystem === "stellar") {
        expect(c.usdc).toMatch(/^C[A-Z2-7]{55}$/);
      } else {
        // Starknet felt252 — `0x` + up to 64 hex chars.
        expect(c.usdc).toMatch(/^0x[a-fA-F0-9]{1,64}$/);
      }
    }
  });

  it("every chain has a TokenMessenger and MessageTransmitter", () => {
    for (const c of allChains()) {
      if (c.ecosystem === "evm") {
        expect(c.tokenMessenger).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(c.messageTransmitter).toMatch(/^0x[a-fA-F0-9]{40}$/);
      } else if (c.ecosystem === "solana") {
        expect(c.tokenMessengerMinter).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
        expect(c.messageTransmitter).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      } else if (c.ecosystem === "stellar") {
        expect(c.tokenMessengerMinter).toMatch(/^C[A-Z2-7]{55}$/);
        expect(c.messageTransmitter).toMatch(/^C[A-Z2-7]{55}$/);
        expect(c.cctpForwarder).toMatch(/^C[A-Z2-7]{55}$/);
      } else {
        // Starknet felt252 addresses — `0x` + up to 64 hex chars.
        expect(c.tokenMessengerMinter).toMatch(/^0x[a-fA-F0-9]{1,64}$/);
        expect(c.messageTransmitter).toMatch(/^0x[a-fA-F0-9]{1,64}$/);
      }
    }
  });

  it("every chain has at least one RPC URL", () => {
    for (const c of allChains()) {
      expect(c.defaultRpcUrls.length).toBeGreaterThan(0);
      expect(c.defaultRpcUrls[0]).toMatch(/^https?:\/\//);
    }
  });
});

describe("mainnet EVM contract addresses are uniform", () => {
  const evmChains = MAINNET_CHAINS.filter((c) => c.ecosystem === "evm");
  const addr = evmChains[0]!;
  it("share the same tokenMessenger", () => {
    for (const c of evmChains) {
      expect(c.tokenMessenger).toBe(addr.tokenMessenger);
    }
  });
  it("share the same messageTransmitter", () => {
    for (const c of evmChains) {
      expect(c.messageTransmitter).toBe(addr.messageTransmitter);
    }
  });
});

describe("testnet EVM contract addresses are uniform", () => {
  const evmChains = TESTNET_CHAINS.filter((c) => c.ecosystem === "evm");
  const addr = evmChains[0]!;
  it("share the same tokenMessenger", () => {
    for (const c of evmChains) {
      expect(c.tokenMessenger).toBe(addr.tokenMessenger);
    }
  });
  it("share the same messageTransmitter", () => {
    for (const c of evmChains) {
      expect(c.messageTransmitter).toBe(addr.messageTransmitter);
    }
  });
});

describe("getChain", () => {
  it("returns the chain by name", () => {
    expect(getChain("Ethereum")).toBe(Ethereum);
    expect(getChain("ArbitrumSepolia")).toBe(ArbitrumSepolia);
  });

  it("throws UnknownChainError on missing name", () => {
    expect(() => getChain("Nope")).toThrow(UnknownChainError);
  });

  it("tryGetChain returns undefined on miss", () => {
    expect(tryGetChain("Nope")).toBeUndefined();
  });
});

describe("chainByEvmChainId", () => {
  it("finds Ethereum mainnet by id 1", () => {
    expect(chainByEvmChainId(1)).toBe(Ethereum);
  });

  it("finds Base Sepolia by id 84532", () => {
    expect(chainByEvmChainId(84532)).toBe(BaseSepolia);
  });

  it("throws on unknown id", () => {
    expect(() => chainByEvmChainId(99999)).toThrow(UnknownChainError);
  });

  it("tryChainByEvmChainId returns undefined on miss", () => {
    expect(tryChainByEvmChainId(99999)).toBeUndefined();
  });
});

describe("chainByDomain", () => {
  it("requires the network discriminator (mainnet vs testnet share domain)", () => {
    expect(chainByDomain(0, "mainnet")).toBe(Ethereum);
    expect(chainByDomain(0, "testnet")).toBe(EthereumSepolia);
  });

  it("finds every valid domain pair", () => {
    expect(chainByDomain(7, "mainnet")).toBe(Polygon);
    expect(chainByDomain(7, "testnet")).toBe(PolygonAmoy);
    expect(chainByDomain(6, "mainnet")).toBe(Base);
    expect(chainByDomain(6, "testnet")).toBe(BaseSepolia);
  });

  it("throws on unknown domain", () => {
    expect(() => chainByDomain(99, "mainnet")).toThrow(UnknownChainError);
  });

  it("tryChainByDomain returns undefined on miss", () => {
    expect(tryChainByDomain(99, "mainnet")).toBeUndefined();
  });
});

describe("chainsByNetwork", () => {
  it("returns mainnet chains only", () => {
    const list = chainsByNetwork("mainnet");
    // 9 EVM + Solana mainnet-beta + Stellar mainnet + Starknet mainnet
    expect(list.length).toBe(12);
    for (const c of list) expect(c.network).toBe("mainnet");
  });

  it("returns testnet chains only", () => {
    const list = chainsByNetwork("testnet");
    // 9 EVM + Solana devnet + Stellar testnet + Starknet Sepolia
    expect(list.length).toBe(12);
    for (const c of list) expect(c.network).toBe("testnet");
  });
});

describe("explorer URLs", () => {
  it("explorerTxUrl appends /tx/<hash>", () => {
    expect(explorerTxUrl(Arbitrum, "0xdeadbeef")).toBe(
      "https://arbiscan.io/tx/0xdeadbeef",
    );
  });

  it("explorerAddressUrl appends /address/<addr>", () => {
    expect(explorerAddressUrl(Base, "0x1234")).toBe(
      "https://basescan.org/address/0x1234",
    );
  });
});
