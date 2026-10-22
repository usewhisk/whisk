import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArcTestnet, Base } from "@usewhisk/cctp";
import { createMemoryInflightStore } from "../inflight/index.js";
import { createWhisk } from "./createWhisk.js";
import {
  createFakeEvmWallet,
  createFakeIris,
  type FakeIris,
} from "../test/harness/index.js";

const PAYER = "0x0000000000000000000000000000000000000010";
const RECIPIENT = "0x0000000000000000000000000000000000000020";
const GWEI = 1_000_000_000n;

let iris: FakeIris;
beforeEach(() => {
  iris = createFakeIris();
  vi.stubGlobal("fetch", () => {
    throw new Error("the engine used the global fetch");
  });
});
afterEach(() => vi.unstubAllGlobals());

const wallet = (chainId: number) => createFakeEvmWallet({ chainId }).adapter;

describe("engine.balance", () => {
  it("reads the payer's USDC on an EVM chain", async () => {
    iris.setUsdcBalance(PAYER, 12_500_000n);
    const engine = createWhisk({ chains: ["Base"], fetch: iris.fetch });
    expect(await engine.balance({ chain: "Base", address: PAYER })).toBe(
      12_500_000n,
    );
  });

  it("is null where Whisk cannot read it yet", async () => {
    const engine = createWhisk({ chains: ["Solana"], fetch: iris.fetch });
    expect(
      await engine.balance({
        chain: "Solana",
        address: "11111111111111111111111111111112",
      }),
    ).toBeNull();
  });
});

describe("engine.maxSendable", () => {
  it("#71 holds back Arc gas, paid from the same USDC", async () => {
    iris.setUsdcBalance(PAYER, 10_000_000n);
    iris.setGasPrice(20n * GWEI);
    const engine = createWhisk({ chains: ["Arc_Testnet"], fetch: iris.fetch });
    const max = await engine.maxSendable({
      sourceChain: "Arc_Testnet",
      destinationChain: "Arc_Testnet",
      recipient: { address: RECIPIENT, chain: "Arc_Testnet" },
      adapter: wallet(ArcTestnet.evmChainId),
    });
    // 100,000 gas at 25 gwei (20 plus a quarter) is 0.0025 USDC.
    expect(max).toEqual({
      amount: "9.9975",
      balance: 10_000_000n,
      gasReserve: 2_500n,
    });
  });

  it("leaves room for the bridge fees on a sender-pays bridge", async () => {
    iris.setUsdcBalance(PAYER, 10_000_000n);
    const engine = createWhisk({
      chains: ["Base", "Arbitrum"],
      fetch: iris.fetch,
    });
    const params = {
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      adapter: wallet(Base.evmChainId),
    } as const;
    const max = await engine.maxSendable(params);
    expect(max?.gasReserve).toBe(0n);

    const quote = await engine.quote({ ...params, amount: max!.amount });
    expect(quote.subunits.amountIn).toBeLessThanOrEqual(10_000_000n);
    expect(quote.subunits.amountIn).toBeGreaterThan(9_999_990n);
  });
});

describe("balance check before signing", () => {
  it("refuses a send the balance cannot cover, before any wallet call", async () => {
    iris.setUsdcBalance(PAYER, 1_000_000n);
    const store = createMemoryInflightStore();
    const fake = createFakeEvmWallet({ chainId: Base.evmChainId });
    const engine = createWhisk({
      chains: ["Base", "Arbitrum"],
      fetch: iris.fetch,
      inflightStore: store,
    });
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "5",
      adapter: fake.adapter,
    });
    await expect(
      engine.send({ adapter: fake.adapter, quote }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(fake.batches).toEqual([]);
    expect(await store.list()).toEqual([]);
  });

  it("#71 counts Arc gas against the balance too", async () => {
    iris.setUsdcBalance(PAYER, 5_000_000n);
    const fake = createFakeEvmWallet({ chainId: ArcTestnet.evmChainId });
    const engine = createWhisk({ chains: ["Arc_Testnet"], fetch: iris.fetch });
    const quote = await engine.quote({
      sourceChain: "Arc_Testnet",
      destinationChain: "Arc_Testnet",
      recipient: { address: RECIPIENT, chain: "Arc_Testnet" },
      amount: "5",
      adapter: fake.adapter,
    });
    await expect(
      engine.send({ adapter: fake.adapter, quote }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(fake.batches).toEqual([]);
  });
});
