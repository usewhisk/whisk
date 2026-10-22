import { describe, expect, it } from "vitest";
import { reattest } from "./index.js";

describe("reattest", () => {
  it("#66 POSTs to /v2/reattest/{nonce} and reads Circle's acknowledgement", async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({
        url: String(input),
        ...(init?.method && { method: init.method }),
        ...(init?.body !== undefined && { body: init.body }),
      });
      return new Response(
        JSON.stringify({
          message: "Re-attestation successfully requested for nonce.",
          nonce: "0x71de",
        }),
      );
    };
    const result = await reattest("0x71de", { network: "testnet", fetch });
    expect(calls).toEqual([
      {
        url: "https://iris-api-sandbox.circle.com/v2/reattest/0x71de",
        method: "POST",
        body: "{}",
      },
    ]);
    expect(result).toEqual({ nonce: "0x71de" });
  });
});
