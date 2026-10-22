import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StarknetWindowObject } from "@starknet-io/get-starknet-core";
import { getChain } from "@usewhisk/core";
import { starknet } from "../config/adapters/starknet.js";
import { createStarknetAdapter } from "./useStarknetAdapter.js";

const HASH = "0x5a1";
const wallet = {} as StarknetWindowObject;

type Receipt = Record<string, unknown> | "missing";

// A node on Starknet RPC 0.10.3, as the public endpoints serve today. It
// answers only at `url` and replays `receipts` in order, then the last one.
function node(url: string, receipts: Receipt[]) {
  const urls: string[] = [];
  let polls = 0;
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = String(input);
      urls.push(target);
      if (target !== url) return new Response("gone", { status: 410 });
      const { id, method } = JSON.parse(String(init?.body)) as {
        id: number;
        method: string;
      };
      const reply = (body: Record<string, unknown>) =>
        new Response(JSON.stringify({ jsonrpc: "2.0", id, ...body }));
      if (method === "starknet_specVersion") return reply({ result: "0.10.3" });
      if (method === "starknet_getTransactionReceipt") {
        const receipt = receipts[Math.min(polls++, receipts.length - 1)]!;
        return receipt === "missing"
          ? reply({
              error: { code: 29, message: "Transaction hash not found" },
            })
          : reply({ result: receipt });
      }
      return reply({ error: { code: -32601, message: `no ${method}` } });
    },
  );
  return { urls };
}

const accepted = (execution: "SUCCEEDED" | "REVERTED") => ({
  type: "INVOKE",
  transaction_hash: HASH,
  execution_status: execution,
  finality_status: "ACCEPTED_ON_L2",
  block_number: 812_345,
  block_hash: "0x1",
  actual_fee: { amount: "0x1", unit: "FRI" },
  messages_sent: [],
  events: [],
  execution_resources: { l1_gas: 0, l1_data_gas: 0, l2_gas: 0 },
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function confirm(network: "mainnet" | "sepolia") {
  const adapter = createStarknetAdapter(
    wallet,
    "0x1",
    starknet({ network }).config,
  );
  const pending = adapter.confirmTransaction(HASH);
  await vi.runAllTimersAsync();
  return pending;
}

describe("starknet()", () => {
  it.each([
    ["mainnet", "Starknet"],
    ["sepolia", "Starknet_Sepolia"],
  ] as const)("defaults %s to the registry's RPC", (network, chain) => {
    expect(starknet({ network }).config.rpcUrl).toBe(
      getChain(chain).defaultRpcUrls[0],
    );
  });
});

describe("createStarknetAdapter confirmTransaction", () => {
  it.each([
    ["mainnet", "Starknet"],
    ["sepolia", "Starknet_Sepolia"],
  ] as const)(
    "confirms on %s through the registry's RPC, which serves spec 0.10",
    async (network, chain) => {
      const url = getChain(chain).defaultRpcUrls[0]!;
      const { urls } = node(url, ["missing", accepted("SUCCEEDED")]);
      await expect(confirm(network)).resolves.toEqual({
        status: "success",
        blockNumber: 812_345,
      });
      expect(urls.every((u) => u === url)).toBe(true);
    },
  );

  it("confirms through an rpcUrl the integrator set", async () => {
    const url = "https://starknet.example.test/rpc";
    node(url, [accepted("SUCCEEDED")]);
    const adapter = createStarknetAdapter(
      wallet,
      "0x1",
      starknet({ network: "sepolia", rpcUrl: url }).config,
    );
    const pending = adapter.confirmTransaction(HASH);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({
      status: "success",
      blockNumber: 812_345,
    });
  });

  it("reports a reverted transaction once it is accepted", async () => {
    node(getChain("Starknet_Sepolia").defaultRpcUrls[0]!, [
      { ...accepted("REVERTED"), finality_status: "PRE_CONFIRMED" },
      accepted("REVERTED"),
    ]);
    await expect(confirm("sepolia")).resolves.toEqual({
      status: "reverted",
      blockNumber: 812_345,
    });
  });
});
