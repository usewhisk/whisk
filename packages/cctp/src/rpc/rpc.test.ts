import { describe, expect, it } from "vitest";
import { ArcTestnet } from "../chains/index.js";
import { ProtocolError } from "../errors.js";
import { getBlockNumber, getTransactionStatus, isNonceUsed } from "./index.js";

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

describe("isNonceUsed and getTransactionStatus", () => {
  const reply =
    (result: unknown): typeof globalThis.fetch =>
    async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  const NONCE = `0x${"ab".repeat(32)}` as const;

  it("reads usedNonces from MessageTransmitterV2", async () => {
    const bodies: { params: [{ to: string; data: string }] }[] = [];
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: `0x${"0".repeat(63)}1`,
        }),
      );
    };
    expect(await isNonceUsed(ArcTestnet, NONCE, { fetch })).toBe(true);
    expect(bodies[0]?.params[0]).toEqual({
      to: ArcTestnet.messageTransmitter,
      data: `0xfeb61724${"ab".repeat(32)}`,
    });
    expect(
      await isNonceUsed(ArcTestnet, NONCE, {
        fetch: reply(`0x${"0".repeat(64)}`),
      }),
    ).toBe(false);
  });

  it("maps a receipt to success, reverted or unknown", async () => {
    const hash = `0x${"12".repeat(32)}` as const;
    expect(
      await getTransactionStatus(ArcTestnet, hash, {
        fetch: reply({ status: "0x1" }),
      }),
    ).toBe("success");
    expect(
      await getTransactionStatus(ArcTestnet, hash, {
        fetch: reply({ status: "0x0" }),
      }),
    ).toBe("reverted");
    expect(
      await getTransactionStatus(ArcTestnet, hash, { fetch: reply(null) }),
    ).toBe("unknown");
  });
});

describe("Arc's load-balanced RPC", () => {
  it("retries -32014, a backend behind the head, on the same endpoint", async () => {
    const urls: string[] = [];
    const replies = [
      {
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32014, message: "block not found" },
      },
      { jsonrpc: "2.0", id: 1, result: "0x10" },
    ];
    const fetch: typeof globalThis.fetch = async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify(replies.shift()));
    };
    expect(await getBlockNumber(ArcTestnet, { fetch })).toBe(16n);
    expect(urls).toEqual([
      ArcTestnet.defaultRpcUrls[0],
      ArcTestnet.defaultRpcUrls[0],
    ]);
  });
});
