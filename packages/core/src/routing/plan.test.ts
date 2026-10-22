import { describe, expect, it } from "vitest";
import { UnknownChainError } from "@usewhisk/cctp";
import {
  NetworkMismatchError,
  RouteUnavailableError,
} from "../errors/errors.js";
import { planRoute } from "./plan.js";

describe("planRoute", () => {
  it("forwards an EVM to EVM transfer and needs only the source wallet", () => {
    const plan = planRoute({
      source: "Base",
      destination: "Arbitrum",
      connected: ["evm"],
      useForwarder: true,
    });
    expect(plan.source.id).toBe("Base");
    expect(plan.destination.id).toBe("Arbitrum");
    expect(plan.network).toBe("mainnet");
    expect(plan.speed).toBe("fast");
    expect(plan.mint).toEqual({ kind: "forwarder" });
    expect(plan.requiredAdapters).toEqual(["evm"]);
  });

  it("takes the network from the source chain", () => {
    const plan = planRoute({
      source: "Base_Sepolia",
      destination: "Ethereum_Sepolia",
      connected: ["evm"],
      useForwarder: true,
    });
    expect(plan.network).toBe("testnet");
  });

  it("refuses chains on different networks", () => {
    expect(() =>
      planRoute({
        source: "Base",
        destination: "Arc_Testnet",
        connected: ["evm"],
        useForwarder: true,
      }),
    ).toThrow(NetworkMismatchError);
  });

  it("refuses Solana mainnet to Devnet as a network mismatch", () => {
    expect(() =>
      planRoute({
        source: "Solana",
        destination: "Solana_Devnet",
        connected: ["solana"],
        useForwarder: true,
      }),
    ).toThrow(NetworkMismatchError);
  });

  it("throws UnknownChainError for an id outside the registry", () => {
    expect(() =>
      planRoute({
        // @ts-expect-error an id the registry does not know
        source: "Base_Mainnet",
        destination: "Arbitrum",
        connected: ["evm"],
        useForwarder: true,
      }),
    ).toThrow(UnknownChainError);
  });

  it("mints with the EVM wallet when forwarding is off", () => {
    const plan = planRoute({
      source: "Base",
      destination: "Arbitrum",
      connected: ["evm"],
      useForwarder: false,
    });
    expect(plan.mint).toEqual({ kind: "adapter", ecosystem: "evm" });
    expect(plan.requiredAdapters).toEqual(["evm"]);
  });

  it("mints with the EVM wallet on a destination Circle does not forward to", () => {
    const plan = planRoute({
      source: "Base",
      destination: "Morph",
      connected: ["evm"],
      useForwarder: true,
    });
    expect(plan.mint).toEqual({ kind: "adapter", ecosystem: "evm" });
  });

  it("forwards Solana to EVM with only the Solana wallet", () => {
    const plan = planRoute({
      source: "Solana",
      destination: "Base",
      connected: ["solana"],
      useForwarder: true,
    });
    expect(plan.mint).toEqual({ kind: "forwarder" });
    expect(plan.requiredAdapters).toEqual(["solana"]);
  });

  it.each([
    ["Base", "Solana", "solana"],
    ["Base", "Stellar", "stellar"],
    ["Base", "Starknet", "starknet"],
    ["Solana", "Stellar", "stellar"],
    ["Starknet", "Solana", "solana"],
  ] as const)(
    "needs a %s wallet and a destination wallet for %s",
    (source, destination, ecosystem) => {
      const sourceEcosystem = source === "Base" ? "evm" : source.toLowerCase();
      const plan = planRoute({
        source,
        destination,
        connected: [sourceEcosystem as "evm", ecosystem],
        useForwarder: true,
      });
      expect(plan.mint).toEqual({ kind: "adapter", ecosystem });
      expect(plan.requiredAdapters).toEqual([sourceEcosystem, ecosystem]);
    },
  );

  it("names the missing destination wallet", () => {
    let caught: unknown;
    try {
      planRoute({
        source: "Base",
        destination: "Solana",
        connected: ["evm"],
        useForwarder: true,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RouteUnavailableError);
    expect(caught).toMatchObject({
      code: "ROUTE_UNAVAILABLE",
      reason: "destination_adapter_required",
      ecosystem: "solana",
    });
  });

  it("refuses a source wallet of the wrong ecosystem", () => {
    expect(() =>
      planRoute({
        source: "Solana",
        destination: "Base",
        connected: ["evm"],
        useForwarder: true,
      }),
    ).toThrow(
      expect.objectContaining({
        reason: "source_adapter_required",
        ecosystem: "solana",
      }),
    );
  });

  it("skips the wallet check when the connected wallets are not known yet", () => {
    const plan = planRoute({
      source: "Base",
      destination: "Solana",
      useForwarder: true,
    });
    expect(plan.requiredAdapters).toEqual(["evm", "solana"]);
  });

  it("mints Solana to EVM with the EVM wallet when forwarding is off", () => {
    const plan = planRoute({
      source: "Solana",
      destination: "Base",
      connected: ["solana", "evm"],
      useForwarder: false,
    });
    expect(plan.mint).toEqual({ kind: "adapter", ecosystem: "evm" });
    expect(plan.requiredAdapters).toEqual(["solana", "evm"]);
  });

  it("mints Starknet to EVM with the EVM wallet, since Circle does not forward from Starknet", () => {
    const plan = planRoute({
      source: "Starknet",
      destination: "Base",
      connected: ["starknet", "evm"],
      useForwarder: true,
    });
    expect(plan.mint).toEqual({ kind: "adapter", ecosystem: "evm" });
  });

  it("plans a source with no Fast Transfer as Standard", () => {
    const plan = planRoute({
      source: "Avalanche",
      destination: "Base",
      connected: ["evm"],
      useForwarder: true,
    });
    expect(plan.speed).toBe("standard");
    expect(plan.etaSeconds).toEqual({ min: 8, max: 8 });
  });

  it("gives a Fast source Circle's Fast attestation time", () => {
    const plan = planRoute({
      source: "Ethereum",
      destination: "Base",
      connected: ["evm"],
      useForwarder: true,
    });
    expect(plan.speed).toBe("fast");
    expect(plan.etaSeconds).toEqual({ min: 20, max: 20 });
  });

  it("refuses the same chain on both sides", () => {
    expect(() =>
      planRoute({
        source: "Base",
        destination: "Base",
        connected: ["evm"],
        useForwarder: true,
      }),
    ).toThrow(expect.objectContaining({ reason: "same_chain" }));
  });
});
