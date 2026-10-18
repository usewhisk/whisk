import { describe, expect, it } from "vitest";
import {
  createIrisLimiter,
  isForwardDone,
  pollBudget,
  pollMessages,
  type IrisMessage,
} from "./index.js";

const BASE: IrisMessage = {
  message: "0x11",
  attestation: "0x22",
  eventNonce: "0x01",
  status: "complete",
  cctpVersion: 2,
};

describe("isForwardDone", () => {
  it("is done once Circle's relayer has a confirmed or complete mint", () => {
    const hash = `0x${"ab".repeat(32)}`;
    expect(
      isForwardDone({
        ...BASE,
        forwardState: "CONFIRMED",
        forwardTxHash: hash,
      }),
    ).toBe(true);
    expect(
      isForwardDone({ ...BASE, forwardState: "COMPLETE", forwardTxHash: hash }),
    ).toBe(true);
    expect(
      isForwardDone({ ...BASE, forwardState: "PENDING", forwardTxHash: hash }),
    ).toBe(false);
    expect(isForwardDone({ ...BASE, forwardState: "CONFIRMED" })).toBe(false);
  });
});

describe("pollBudget", () => {
  it("polls fast routes every 2 s and slow ones less often, for twice the ETA plus 5 minutes", () => {
    expect(pollBudget({ min: 8, max: 8 })).toEqual({
      intervalMs: 2_000,
      timeoutMs: 16_000 + 300_000,
    });
    expect(pollBudget({ min: 900, max: 1140 })).toEqual({
      intervalMs: 10_000,
      timeoutMs: 2_280_000 + 300_000,
    });
    expect(pollBudget({ min: 21_600, max: 115_200 })).toEqual({
      intervalMs: 30_000,
      timeoutMs: 230_400_000 + 300_000,
    });
  });
});

describe("pollMessages", () => {
  it("waits out a 429 stand-down and keeps polling instead of giving up", async () => {
    let t = 0;
    const limiter = createIrisLimiter({
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    });
    const replies = [
      new Response("{}", { status: 429 }),
      new Response(JSON.stringify({ messages: [BASE] })),
    ];
    const fetch: typeof globalThis.fetch = async () => replies.shift()!;
    const standDowns: number[] = [];

    const message = await pollMessages(
      { sourceDomain: 6, transactionHash: "0xabc" },
      {
        network: "testnet",
        fetch,
        limiter,
        intervalMs: 1,
        timeoutMs: 60_000,
        onRateLimited: (retryAt) => standDowns.push(retryAt),
      },
    );
    expect(message?.status).toBe("complete");
    expect(standDowns).toEqual([300_000]);
  });
});
