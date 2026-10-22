import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArcTestnet, Base } from "@usewhisk/cctp";
import type { EvmAdapter, EvmCall } from "./adapter.js";
import { createMemoryInflightStore } from "../inflight/index.js";
import { createWhisk } from "./createWhisk.js";
import {
  createFakeEvmWallet,
  createFakeIris,
  type FakeIris,
} from "../test/harness/index.js";

const RECIPIENT = "0x0000000000000000000000000000000000000020";
const GWEI = 1_000_000_000n;

let iris: FakeIris;
beforeEach(() => {
  iris = createFakeIris();
  iris.replyToMessages({
    message: {
      message: `0x${"11".repeat(32)}`,
      attestation: `0x${"22".repeat(65)}`,
      eventNonce: "1",
      status: "complete",
      cctpVersion: 2,
      forwardState: "COMPLETE",
      forwardTxHash: `0x${"ff".repeat(32)}`,
    },
  });
  vi.stubGlobal("fetch", () => {
    throw new Error("the engine used the global fetch");
  });
});
afterEach(() => vi.unstubAllGlobals());

type FeeCall = EvmCall & {
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
};

function arcWallet() {
  const wallet = createFakeEvmWallet({ chainId: ArcTestnet.evmChainId });
  wallet.fund(ArcTestnet.evmChainId, ArcTestnet.usdc, 100_000_000n);
  return wallet;
}

async function bridgeFromArc() {
  const wallet = arcWallet();
  const engine = createWhisk({
    chains: ["Arc_Testnet", "Base_Sepolia"],
    fetch: iris.fetch,
  });
  const quote = await engine.quote({
    sourceChain: "Arc_Testnet",
    destinationChain: "Base_Sepolia",
    recipient: { address: RECIPIENT, chain: "Base_Sepolia" },
    amount: "5",
    adapter: wallet.adapter,
  });
  const result = await engine.send({ adapter: wallet.adapter, quote });
  expect(result.kind).toBe("success");
  return wallet.batches.flat() as FeeCall[];
}

describe("Arc gas floor", () => {
  it("#71 never offers Arc less than 20 gwei, even when the RPC suggests less", async () => {
    iris.setGasPrice(1n * GWEI);
    const calls = await bridgeFromArc();
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.maxFeePerGas).toBe(20n * GWEI);
      expect(call.maxPriorityFeePerGas).toBe(1n * GWEI);
    }
  });

  it("leaves a quarter of headroom above Arc's current gas price", async () => {
    iris.setGasPrice(40n * GWEI);
    const calls = await bridgeFromArc();
    for (const call of calls) expect(call.maxFeePerGas).toBe(50n * GWEI);
  });

  it("floors a same-chain Arc send too", async () => {
    iris.setGasPrice(1n * GWEI);
    const wallet = arcWallet();
    const engine = createWhisk({ chains: ["Arc_Testnet"], fetch: iris.fetch });
    const quote = await engine.quote({
      sourceChain: "Arc_Testnet",
      destinationChain: "Arc_Testnet",
      recipient: { address: RECIPIENT, chain: "Arc_Testnet" },
      amount: "1",
      adapter: wallet.adapter,
    });
    await engine.send({ adapter: wallet.adapter, quote });
    const calls = wallet.batches.flat() as FeeCall[];
    expect(calls.map((c) => c.maxFeePerGas)).toEqual([20n * GWEI]);
  });

  it("leaves fees to the wallet on other chains", async () => {
    const wallet = createFakeEvmWallet({ chainId: Base.evmChainId });
    wallet.fund(Base.evmChainId, Base.usdc, 100_000_000n);
    const engine = createWhisk({ chains: ["Base"], fetch: iris.fetch });
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Base",
      recipient: { address: RECIPIENT, chain: "Base" },
      amount: "1",
      adapter: wallet.adapter,
    });
    await engine.send({ adapter: wallet.adapter, quote });
    const calls = wallet.batches.flat() as FeeCall[];
    expect(calls.every((c) => c.maxFeePerGas === undefined)).toBe(true);
  });
});

describe("burn hash from the wallet", () => {
  it("#86 keeps the burn hash an adapter reports while it is still waiting for receipts", async () => {
    const wallet = createFakeEvmWallet({ chainId: Base.evmChainId });
    wallet.fund(Base.evmChainId, Base.usdc, 100_000_000n);
    // Like the React adapter: each hash is known before its receipt, and the
    // receipt wait dies with the tab.
    const dying: EvmAdapter = {
      ...wallet.adapter,
      sendCalls: async (calls, options) => {
        await wallet.adapter.sendCalls(calls, options);
        throw new Error("the tab closed while waiting for receipts");
      },
    };
    const store = createMemoryInflightStore();
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
      adapter: dying,
    });
    const result = await engine.send({ adapter: dying, quote });
    expect(result.kind).toBe("failure");

    const records = await engine.inflight();
    expect(records.map((r) => r.step)).toEqual(["burned"]);
    expect(records[0]?.sourceTxHash).toMatch(/^0x0+2$/);
  });
});
