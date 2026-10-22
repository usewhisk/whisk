import { describe, expect, it } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import { StarknetSepolia, StellarTestnet } from "../chains/index.js";
import { isStarknetNonceUsed, isStellarNonceUsed } from "./index.js";

const NONCE = `0x${"11".repeat(16)}${"22".repeat(16)}` as const;

function rpc(result: unknown) {
  const bodies: { method: string; params: Record<string, unknown> }[] = [];
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  };
  return { fetch, bodies };
}

describe("isStarknetNonceUsed", () => {
  it("calls is_nonce_used with the nonce as a low/high u256 at the latest block", async () => {
    const r = rpc(["0x1"]);
    expect(
      await isStarknetNonceUsed(StarknetSepolia, NONCE, { fetch: r.fetch }),
    ).toBe(true);
    expect(r.bodies[0]?.method).toBe("starknet_call");
    expect(r.bodies[0]?.params).toMatchObject({
      request: {
        contract_address: StarknetSepolia.messageTransmitter,
        calldata: [`0x${"22".repeat(16)}`, `0x${"11".repeat(16)}`],
      },
      block_id: "latest",
    });
    expect(
      await isStarknetNonceUsed(StarknetSepolia, NONCE, {
        fetch: rpc(["0x0"]).fetch,
      }),
    ).toBe(false);
  });
});

describe("isStellarNonceUsed", () => {
  it("simulates is_nonce_used and reads the boolean it returns", async () => {
    const r = rpc({
      results: [{ xdr: xdr.ScVal.scvBool(true).toXDR("base64") }],
    });
    expect(
      await isStellarNonceUsed(StellarTestnet, NONCE, { fetch: r.fetch }),
    ).toBe(true);
    expect(r.bodies[0]?.method).toBe("simulateTransaction");
    expect(typeof r.bodies[0]?.params.transaction).toBe("string");
  });

  it("does not accept a result that is not a boolean", async () => {
    const r = rpc({ results: [{ xdr: xdr.ScVal.scvU32(1).toXDR("base64") }] });
    await expect(
      isStellarNonceUsed(StellarTestnet, NONCE, { fetch: r.fetch }),
    ).rejects.toThrow(/simulateTransaction/);
  });
});
