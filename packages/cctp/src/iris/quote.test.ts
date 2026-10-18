import { describe, expect, it } from "vitest";
import { IrisHttpError, IrisParseError } from "../errors.js";
import { getFastBurnAllowance, getSignedBurnQuote } from "./index.js";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const QUOTE = {
  signedQuote: "0x0100aa",
  issuedAt: 1783407750,
  expiry: {
    mode: "BLOCK_NUMBER",
    expiresAtBlock: 43819792,
    blockEstimatedAt: 1783407872,
  },
  feeTotalAmount: "24453",
  burnAmount: "10000000",
  feeToken: USDC,
  items: [
    {
      type: "FORWARD",
      amount: "23153",
      args: ["0x01"],
      argsHash: `0x${"ab".repeat(32)}`,
    },
    {
      type: "PRE_FINALITY",
      amount: "1300",
      args: ["0x02"],
      argsHash: `0x${"cd".repeat(32)}`,
    },
  ],
  nonce: "0",
};

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), ...(init && { init }) });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

describe("getSignedBurnQuote", () => {
  it("posts the amount, fee token and requests and maps the reply to bigints", async () => {
    const f = fakeFetch(200, QUOTE);
    const quote = await getSignedBurnQuote(
      "testnet",
      6,
      26,
      {
        amount: 10_000_000n,
        feeToken: USDC,
        requests: ["FORWARD", "PRE_FINALITY"],
      },
      { fetch: f.fetch },
    );

    expect(f.calls[0]?.url).toBe(
      "https://iris-api-sandbox.circle.com/v2/quote/burn/usdc/6/26",
    );
    expect(f.calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(f.calls[0]?.init?.body))).toEqual({
      amount: "10000000",
      feeToken: USDC,
      requests: [{ type: "FORWARD" }, { type: "PRE_FINALITY" }],
    });
    expect(quote).toEqual({
      signedQuote: "0x0100aa",
      issuedAt: 1783407750,
      expiry: { mode: "BLOCK_NUMBER", expiresAtBlock: 43819792n },
      feeTotalAmount: 24453n,
      feeToken: USDC,
      burnAmount: 10_000_000n,
      items: [
        { type: "FORWARD", amount: 23153n },
        { type: "PRE_FINALITY", amount: 1300n },
      ],
    });
  });

  it("reads a wall-clock expiry", async () => {
    const f = fakeFetch(200, {
      ...QUOTE,
      expiry: { mode: "TIMESTAMP", expiresAt: 1783407870 },
    });
    const quote = await getSignedBurnQuote(
      "mainnet",
      0,
      6,
      {
        amount: 10_000_000n,
        feeToken: USDC,
        requests: ["FORWARD", "PRE_FINALITY"],
      },
      { fetch: f.fetch },
    );
    expect(quote.expiry).toEqual({ mode: "TIMESTAMP", expiresAt: 1783407870 });
  });

  it("rejects items that do not add up to the total", async () => {
    const f = fakeFetch(200, { ...QUOTE, feeTotalAmount: "1" });
    await expect(
      getSignedBurnQuote(
        "testnet",
        6,
        26,
        { amount: 10_000_000n, feeToken: USDC, requests: ["FORWARD"] },
        { fetch: f.fetch },
      ),
    ).rejects.toBeInstanceOf(IrisParseError);
  });

  it("rejects a quote for a different amount", async () => {
    const f = fakeFetch(200, QUOTE);
    await expect(
      getSignedBurnQuote(
        "testnet",
        6,
        26,
        { amount: 9n, feeToken: USDC, requests: ["FORWARD"] },
        { fetch: f.fetch },
      ),
    ).rejects.toBeInstanceOf(IrisParseError);
  });

  it("rejects a fee in another token", async () => {
    const f = fakeFetch(200, { ...QUOTE, feeToken: `0x${"00".repeat(20)}` });
    await expect(
      getSignedBurnQuote(
        "testnet",
        6,
        26,
        { amount: 10_000_000n, feeToken: USDC, requests: ["FORWARD"] },
        { fetch: f.fetch },
      ),
    ).rejects.toBeInstanceOf(IrisParseError);
  });

  it("surfaces Circle's refusal without retrying", async () => {
    const f = fakeFetch(422, {
      errorCode: "PRE_FINALITY_INSUFFICIENT_ALLOWANCE",
      error: "allowance",
    });
    const sent = getSignedBurnQuote(
      "mainnet",
      0,
      6,
      { amount: 1n, feeToken: USDC, requests: ["PRE_FINALITY"] },
      { fetch: f.fetch },
    );
    await expect(sent).rejects.toBeInstanceOf(IrisHttpError);
    await expect(sent).rejects.toMatchObject({ status: 422 });
    expect(f.calls).toHaveLength(1);
  });
});

describe("getFastBurnAllowance", () => {
  it("reads the remaining allowance in USDC subunits, rounded down", async () => {
    const f = fakeFetch(200, {
      allowance: 54035694.3865217,
      lastUpdated: "2026-10-18T14:03:27.355Z",
    });
    expect(await getFastBurnAllowance("mainnet", { fetch: f.fetch })).toBe(
      54_035_694_386_521n,
    );
    expect(f.calls[0]?.url).toBe(
      "https://iris-api.circle.com/v2/fastBurn/USDC/allowance",
    );
  });

  it("rejects a reply without a numeric allowance", async () => {
    const f = fakeFetch(200, { allowance: "lots" });
    await expect(
      getFastBurnAllowance("mainnet", { fetch: f.fetch }),
    ).rejects.toBeInstanceOf(IrisParseError);
  });
});
