import { describe, expect, it } from "vitest";
import { IrisRateLimitedError } from "../errors.js";
import { createIrisLimiter, getBurnFees, getMessages } from "./index.js";

function clock() {
  let t = 1_000_000;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    slept,
  };
}

function fakeFetch(status = 200, body: unknown = []) {
  const urls: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, urls };
}

describe("Iris rate limiter", () => {
  it("lets a burst through up to the rate, then spaces requests out", async () => {
    const c = clock();
    const limiter = createIrisLimiter({
      ratePerSecond: 2,
      now: c.now,
      sleep: c.sleep,
    });
    await limiter.acquire("iris-api.circle.com");
    await limiter.acquire("iris-api.circle.com");
    expect(c.slept).toEqual([]);
    await limiter.acquire("iris-api.circle.com");
    expect(c.slept).toEqual([500]);
  });

  it("stands down for five minutes after a 429 instead of retrying", async () => {
    const c = clock();
    const limiter = createIrisLimiter({ now: c.now, sleep: c.sleep });
    const f = fakeFetch(429, { error: "rate limited" });

    const first = getBurnFees("mainnet", 6, 3, { fetch: f.fetch, limiter });
    await expect(first).rejects.toBeInstanceOf(IrisRateLimitedError);
    await expect(first).rejects.toMatchObject({ retryAt: 1_000_000 + 300_000 });
    expect(f.urls).toHaveLength(1);

    // Every caller in the process sees the stand-down without asking Iris.
    await expect(
      getBurnFees("mainnet", 6, 3, { fetch: f.fetch, limiter }),
    ).rejects.toBeInstanceOf(IrisRateLimitedError);
    expect(f.urls).toHaveLength(1);

    c.advance(300_000);
    const ok = fakeFetch(200, []);
    await expect(
      getBurnFees("mainnet", 6, 3, { fetch: ok.fetch, limiter }),
    ).resolves.toEqual([]);
  });

  it("keeps the sandbox and production hosts apart", async () => {
    const c = clock();
    const limiter = createIrisLimiter({ now: c.now, sleep: c.sleep });
    await expect(
      getBurnFees("mainnet", 6, 3, { fetch: fakeFetch(429).fetch, limiter }),
    ).rejects.toBeInstanceOf(IrisRateLimitedError);

    const sandbox = fakeFetch(200, { messages: [] });
    await expect(
      getMessages(
        { sourceDomain: 6, transactionHash: "0xabc" },
        { network: "testnet", fetch: sandbox.fetch, limiter },
      ),
    ).resolves.toEqual([]);
  });
});
