import { describe, expect, it } from "vitest";
import { StarknetSepolia } from "../chains/index.js";
import { getStarknetClassHashAt } from "./index.js";

function rpc(reply: Record<string, unknown>) {
  const bodies: { method: string; params: Record<string, unknown> }[] = [];
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, ...reply }));
  };
  return { fetch, bodies };
}

const ACCOUNT = `0x04${"5a".repeat(31)}`;
const CLASS_HASH =
  "0x78a357382d29a07ab7e32c5ce3ffae20021abee67c353b8885737b1d643eac9";

describe("getStarknetClassHashAt", () => {
  it("reads the class hash at the latest block", async () => {
    const r = rpc({ result: CLASS_HASH });
    await expect(
      getStarknetClassHashAt(StarknetSepolia, ACCOUNT, { fetch: r.fetch }),
    ).resolves.toBe(CLASS_HASH);
    expect(r.bodies[0]).toMatchObject({
      method: "starknet_getClassHashAt",
      params: { block_id: "latest", contract_address: ACCOUNT },
    });
  });

  it("returns null when nothing is deployed at the address", async () => {
    const r = rpc({ error: { code: 20, message: "Contract not found" } });
    await expect(
      getStarknetClassHashAt(StarknetSepolia, ACCOUNT, { fetch: r.fetch }),
    ).resolves.toBeNull();
  });

  it("does not take any other error or a malformed hash as an answer", async () => {
    for (const reply of [
      { error: { code: -32602, message: "Invalid params" } },
      { result: "not a felt" },
      { result: null },
    ]) {
      await expect(
        getStarknetClassHashAt(StarknetSepolia, ACCOUNT, {
          fetch: rpc(reply).fetch,
        }),
      ).rejects.toThrow(/starknet_getClassHashAt/);
    }
  });
});
