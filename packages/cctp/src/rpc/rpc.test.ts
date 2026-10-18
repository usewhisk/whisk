import { describe, expect, it } from "vitest";
import { ArcTestnet } from "../chains/index.js";
import { ProtocolError } from "../errors.js";
import { getBlockNumber } from "./index.js";

describe("getBlockNumber", () => {
  it("reads eth_blockNumber from the chain's RPC", async () => {
    const bodies: unknown[] = [];
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x29c9a10" }),
      );
    };
    expect(await getBlockNumber(ArcTestnet, { fetch })).toBe(43_817_488n);
    expect(bodies).toEqual([
      { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
    ]);
  });

  it("rejects a result that is not a hex quantity", async () => {
    const fetch: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "soon" }));
    await expect(getBlockNumber(ArcTestnet, { fetch })).rejects.toBeInstanceOf(
      ProtocolError,
    );
  });
});
