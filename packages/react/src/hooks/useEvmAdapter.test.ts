import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "@wagmi/core";

const sent: Record<string, unknown>[] = [];
const waits: { hash: string; confirmations?: number }[] = [];
const events: string[] = [];
const batches: Record<string, unknown>[] = [];
const wallet: {
  capabilities: () => Promise<Record<string, unknown>>;
  sendCalls: () => Promise<{ id: string }>;
  receipts: { transactionHash: string }[];
} = {
  capabilities: async () => ({}),
  sendCalls: async () => ({ id: "batch-1" }),
  receipts: [],
};

vi.mock("@wagmi/core", () => ({
  getCapabilities: (_config: unknown, args: { chainId: number }) => {
    events.push(`capabilities ${args.chainId}`);
    return wallet.capabilities();
  },
  sendCalls: (_config: unknown, args: Record<string, unknown>) => {
    batches.push(args);
    return wallet.sendCalls();
  },
  waitForCallsStatus: async (_config: unknown, args: { id: string }) => {
    events.push(`waited ${args.id}`);
    return { status: "success", receipts: wallet.receipts };
  },
  getChainId: () => 5_042_002,
  switchChain: async () => undefined,
  sendTransaction: async (_config: unknown, tx: Record<string, unknown>) => {
    sent.push(tx);
    const hash = `0x${String(sent.length).padStart(64, "0")}`;
    events.push(`sent ${hash}`);
    return hash;
  },
  waitForTransactionReceipt: async (
    _config: unknown,
    args: { hash: string; confirmations?: number },
  ) => {
    waits.push(args);
    events.push(`mined ${args.hash}`);
    return { status: "success", blockNumber: 1n };
  },
}));

const { createWagmiEvmAdapter } = await import("./useEvmAdapter.js");
const { AtomicityNotSupportedError, MethodNotFoundRpcError } =
  await import("viem");

const ADDRESS = "0x0000000000000000000000000000000000000010";
const CALL = { to: ADDRESS, data: "0x" as const, value: 0n };

beforeEach(() => {
  sent.length = 0;
  waits.length = 0;
  events.length = 0;
  batches.length = 0;
  wallet.capabilities = async () => ({});
  wallet.sendCalls = async () => ({ id: "batch-1" });
  wallet.receipts = [];
});

describe("createWagmiEvmAdapter", () => {
  it("passes the engine's fee settings through to the wallet", async () => {
    const adapter = createWagmiEvmAdapter({} as Config, ADDRESS);
    await adapter.sendCalls([
      {
        ...CALL,
        maxFeePerGas: 20_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      },
    ]);
    expect(sent[0]).toMatchObject({
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    });
  });

  it("reports each hash before waiting for its receipt", async () => {
    const adapter = createWagmiEvmAdapter({} as Config, ADDRESS);
    await adapter.sendCalls([CALL, CALL], {
      onSubmitted: (hash) => events.push(`reported ${hash}`),
    });
    const one = `0x${"1".padStart(64, "0")}`;
    expect(events.slice(0, 3)).toEqual([
      `sent ${one}`,
      `reported ${one}`,
      `mined ${one}`,
    ]);
  });

  it("waits a second block before a call that depends on the one before", async () => {
    // A load-balanced RPC one block behind estimates the burn against the
    // allowance from before the approve.
    const adapter = createWagmiEvmAdapter({} as Config, ADDRESS);
    await adapter.sendCalls([CALL, CALL]);
    expect(waits.map((w) => w.confirmations)).toEqual([2, 1]);
  });
});

describe("createWagmiEvmAdapter atomic batches", () => {
  const HASH = `0x${"ab".repeat(32)}`;

  it.each([
    ["supported", true],
    ["ready", true],
    ["unsupported", false],
  ])("reads atomic %s as %s", async (status, expected) => {
    wallet.capabilities = async () => ({ atomic: { status } });
    const adapter = createWagmiEvmAdapter({} as Config, ADDRESS);
    await expect(adapter.supportsAtomicBatch?.(8453)).resolves.toBe(expected);
    expect(events).toEqual(["capabilities 8453"]);
  });

  it("says no when the wallet has no EIP-5792", async () => {
    wallet.capabilities = async () => {
      throw new MethodNotFoundRpcError(new Error("not found"));
    };
    const adapter = createWagmiEvmAdapter({} as Config, ADDRESS);
    await expect(adapter.supportsAtomicBatch?.(8453)).resolves.toBe(false);
  });

  it("sends one forced-atomic batch and reports its hash once it lands", async () => {
    wallet.receipts = [{ transactionHash: HASH }];
    const adapter = createWagmiEvmAdapter({} as Config, ADDRESS);
    const reported: [string, number][] = [];
    const result = await adapter.sendCalls([CALL, CALL, CALL], {
      atomic: true,
      onSubmitted: (hash, index) => reported.push([hash, index]),
    });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ forceAtomic: true, account: ADDRESS });
    expect(batches[0]?.calls).toHaveLength(3);
    expect(sent).toEqual([]);
    expect(events).toEqual(["waited batch-1"]);
    expect(reported).toEqual([[HASH, 2]]);
    expect(result.hashes).toEqual([HASH]);
  });

  it("refuses an atomic batch before sending when the wallet cannot", async () => {
    wallet.sendCalls = async () => {
      throw new AtomicityNotSupportedError(new Error("no"));
    };
    const adapter = createWagmiEvmAdapter({} as Config, ADDRESS);
    await expect(
      adapter.sendCalls([CALL, CALL], { atomic: true }),
    ).rejects.toMatchObject({
      code: "WALLET_CAPABILITY",
      category: "atomic_unsupported",
    });
  });

  it("refuses an atomic batch for calls that carry their own gas price", async () => {
    const adapter = createWagmiEvmAdapter({} as Config, ADDRESS);
    await expect(
      adapter.sendCalls([{ ...CALL, maxFeePerGas: 20_000_000_000n }], {
        atomic: true,
      }),
    ).rejects.toMatchObject({ category: "atomic_unsupported" });
    expect(batches).toEqual([]);
  });

  it("fails a batch that never landed", async () => {
    const adapter = createWagmiEvmAdapter({} as Config, ADDRESS);
    await expect(
      adapter.sendCalls([CALL], { atomic: true }),
    ).rejects.toMatchObject({ category: "reverted_onchain" });
  });
});
