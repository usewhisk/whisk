import { describe, expect, it } from "vitest";
import { StarknetSepolia } from "../chains/index.js";
import { getStarknetTransactionStatus } from "./index.js";

function rpc(reply: Record<string, unknown>) {
  const bodies: { method: string; params: Record<string, unknown> }[] = [];
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, ...reply }));
  };
  return { fetch, bodies };
}

const receipt = (finality: string, execution: string) => ({
  result: {
    finality_status: finality,
    execution_status: execution,
    block_number: 812_345,
  },
});

describe("getStarknetTransactionStatus", () => {
  it("reads the receipt by hash", async () => {
    const r = rpc(receipt("ACCEPTED_ON_L2", "SUCCEEDED"));
    await expect(
      getStarknetTransactionStatus(StarknetSepolia, "0x5a1", {
        fetch: r.fetch,
      }),
    ).resolves.toEqual({ state: "success", blockNumber: 812_345 });
    expect(r.bodies[0]).toMatchObject({
      method: "starknet_getTransactionReceipt",
      params: { transaction_hash: "0x5a1" },
    });
  });

  it.each([
    ["ACCEPTED_ON_L1", "REVERTED", { state: "reverted", blockNumber: 812_345 }],
    ["PRE_CONFIRMED", "SUCCEEDED", { state: "pending" }],
    ["RECEIVED", "SUCCEEDED", { state: "pending" }],
  ])("maps %s / %s", async (finality, execution, expected) => {
    const r = rpc(receipt(finality, execution));
    await expect(
      getStarknetTransactionStatus(StarknetSepolia, "0x5a1", {
        fetch: r.fetch,
      }),
    ).resolves.toEqual(expected);
  });

  it("treats an unknown hash as pending, since the node may not have it yet", async () => {
    const r = rpc({
      error: { code: 29, message: "Transaction hash not found" },
    });
    await expect(
      getStarknetTransactionStatus(StarknetSepolia, "0x5a1", {
        fetch: r.fetch,
      }),
    ).resolves.toEqual({ state: "pending" });
  });

  it("does not accept any other error or an unknown status", async () => {
    for (const reply of [
      { error: { code: -32602, message: "Invalid params" } },
      receipt("ACCEPTED_ON_L2", "MAYBE"),
    ]) {
      await expect(
        getStarknetTransactionStatus(StarknetSepolia, "0x5a1", {
          fetch: rpc(reply).fetch,
        }),
      ).rejects.toThrow(/starknet_getTransactionReceipt/);
    }
  });
});
