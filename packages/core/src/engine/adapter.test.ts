/**
 * Adapter contract — type-level shape lock.
 *
 * These tests fail to compile if the public adapter surface drifts.
 */
import { describe, expect, it } from "vitest";
import type {
  EvmAdapter,
  EvmCall,
  SendCallsResult,
  WhiskAdapter,
} from "./adapter.js";

function makeAdapter(): EvmAdapter {
  const calls: EvmCall[] = [];
  return {
    kind: "evm",
    address: "0x0000000000000000000000000000000000000001",
    async getChainId() {
      return 8453;
    },
    async switchChain(_chainId: number) {
      // no-op
    },
    async sendCalls(submitted: EvmCall[]): Promise<SendCallsResult> {
      calls.push(...submitted);
      return {
        hashes: submitted.map(
          (_, i) => ("0x" + i.toString(16).padStart(64, "0")) as `0x${string}`,
        ),
      };
    },
    async waitForReceipt(_hash) {
      return { status: "success", blockNumber: 1n };
    },
  };
}

describe("EvmAdapter contract", () => {
  it("conforms to the EvmAdapter shape", async () => {
    const adapter = makeAdapter();
    expect(adapter.kind).toBe("evm");
    expect(adapter.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(await adapter.getChainId()).toBe(8453);
  });

  it("WhiskAdapter is assignable from EvmAdapter (v1 union has one member)", () => {
    const adapter: EvmAdapter = makeAdapter();
    const whisk: WhiskAdapter = adapter;
    expect(whisk.kind).toBe("evm");
  });

  it("sendCalls returns at least one hash per submitted call", async () => {
    const adapter = makeAdapter();
    const result = await adapter.sendCalls([
      {
        to: "0x000000000000000000000000000000000000dEaD",
        data: "0x",
        value: 0n,
      },
      {
        to: "0x000000000000000000000000000000000000dEaD",
        data: "0xdeadbeef",
        value: 0n,
      },
    ]);
    expect(result.hashes).toHaveLength(2);
    expect(result.hashes[0]).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });
});
