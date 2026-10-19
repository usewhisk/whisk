import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "@wagmi/core";

const sent: Record<string, unknown>[] = [];
const waits: { hash: string; confirmations?: number }[] = [];
const events: string[] = [];

vi.mock("@wagmi/core", () => ({
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

const ADDRESS = "0x0000000000000000000000000000000000000010";
const CALL = { to: ADDRESS, data: "0x" as const, value: 0n };

beforeEach(() => {
  sent.length = 0;
  waits.length = 0;
  events.length = 0;
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
