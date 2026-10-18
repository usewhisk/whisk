import { describe, expect, it } from "vitest";
import { ArcTestnet, BaseSepolia, Sei } from "../chains/index.js";
import { InvalidInputError, ProtocolError } from "../errors.js";
import { getStandardMinFee } from "./index.js";

type RpcCall = { url: string; to: string; data: string };

function fakeRpc(reply: (url: string) => Response) {
  const calls: RpcCall[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params: [{ to: string; data: string }, string];
    };
    expect(body.method).toBe("eth_call");
    calls.push({ url, to: body.params[0].to, data: body.params[0].data });
    return reply(url);
  };
  return { fetch, calls };
}

const result = (value: bigint) =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: `0x${value.toString(16).padStart(64, "0")}`,
    }),
  );

describe("getStandardMinFee", () => {
  it("reads getMinFeeAmount from the TokenMessengerV2", async () => {
    const rpc = fakeRpc(() => result(1_234n));
    const fee = await getStandardMinFee(ArcTestnet, 5_000_000n, {
      fetch: rpc.fetch,
    });
    expect(fee).toBe(1_234n);
    expect(rpc.calls).toEqual([
      {
        url: ArcTestnet.defaultRpcUrls[0],
        to: ArcTestnet.tokenMessenger,
        data: `0x516990e3${5_000_000n.toString(16).padStart(64, "0")}`,
      },
    ]);
  });

  it("uses the caller's RPC URLs first and moves to the next on failure", async () => {
    const rpc = fakeRpc((url) =>
      url === "https://first.example"
        ? new Response("busy", { status: 503 })
        : result(7n),
    );
    const fee = await getStandardMinFee(Sei, 1n, {
      rpcUrls: ["https://first.example", "https://second.example"],
      fetch: rpc.fetch,
    });
    expect(fee).toBe(7n);
    expect(rpc.calls.map((c) => c.url)).toEqual([
      "https://first.example",
      "https://second.example",
    ]);
  });

  it("fails when every RPC fails", async () => {
    const rpc = fakeRpc(
      () =>
        new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000 } }),
        ),
    );
    await expect(
      getStandardMinFee(ArcTestnet, 1n, { fetch: rpc.fetch }),
    ).rejects.toBeInstanceOf(ProtocolError);
  });

  it("rejects a result that is not one uint256", async () => {
    const rpc = fakeRpc(
      () =>
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x" })),
    );
    await expect(
      getStandardMinFee(ArcTestnet, 1n, { fetch: rpc.fetch }),
    ).rejects.toBeInstanceOf(ProtocolError);
  });

  it("refuses a chain whose TokenMessengerV2 has no fee switch", async () => {
    const rpc = fakeRpc(() => result(0n));
    await expect(
      getStandardMinFee(BaseSepolia, 1n, { fetch: rpc.fetch }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    expect(rpc.calls).toEqual([]);
  });
});
