import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IrisHttpError, IrisParseError, ProtocolError } from "../errors.js";
import {
  FINALITY_FAST,
  FINALITY_STANDARD,
  IRIS_MAINNET_URL,
  IRIS_SANDBOX_URL,
  getBurnFees,
  getMessages,
  irisBaseUrl,
  pickFeeTier,
  pickForwarderFee,
} from "./index.js";

describe("irisBaseUrl", () => {
  it("mainnet → production", () => {
    expect(irisBaseUrl("mainnet")).toBe(IRIS_MAINNET_URL);
  });
  it("testnet → sandbox", () => {
    expect(irisBaseUrl("testnet")).toBe(IRIS_SANDBOX_URL);
  });
});

describe("getBurnFees", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the right URL with ?forward=true by default", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          finalityThreshold: 1000,
          minimumFee: 1.3,
          forwardFee: { low: 206035, med: 207543, high: 209052 },
        },
      ]),
    );
    const tiers = await getBurnFees("testnet", 6, 1);
    expect(tiers).toHaveLength(1);
    expect(tiers[0]?.minimumFee).toBe(130n);
    expect(tiers[0]?.forwardFee?.med).toBe(207_543n);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain(`${IRIS_SANDBOX_URL}/v2/burn/USDC/fees/6/1`);
    expect(calledUrl).toContain("forward=true");
  });

  it("parses fees exactly and rounds fractional subunits up", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          finalityThreshold: 1000,
          minimumFee: 1.1,
          forwardFee: { low: 100.4, med: 200.6, high: 300.1 },
        },
      ]),
    );
    const [tier] = await getBurnFees("testnet", 6, 1);
    expect(tier?.minimumFee).toBe(110n);
    expect(tier?.forwardFee).toEqual({ low: 101n, med: 201n, high: 301n });
  });

  it("rejects a minimumFee Iris sends in exponent form", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ finalityThreshold: 1000, minimumFee: 1e-7 }]),
    );
    await expect(getBurnFees("testnet", 6, 1)).rejects.toBeInstanceOf(
      IrisParseError,
    );
  });

  it("omits ?forward=true when includeForwarderFee is false", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ finalityThreshold: 1000, minimumFee: 0 }]),
    );
    await getBurnFees("mainnet", 0, 6, { includeForwarderFee: false });
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).not.toContain("forward=true");
    expect(calledUrl).toContain(IRIS_MAINNET_URL);
  });

  it("keeps the Fast and Standard rows and picks one by speed", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          finalityThreshold: 1000,
          minimumFee: 1,
          forwardFee: { low: 100, med: 150, high: 200 },
        },
        {
          finalityThreshold: 2000,
          minimumFee: 0,
          forwardFee: { low: 100, med: 150, high: 200 },
        },
      ]),
    );
    const tiers = await getBurnFees("testnet", 0, 3);
    expect(tiers.map((t) => t.finalityThreshold)).toEqual([
      FINALITY_FAST,
      FINALITY_STANDARD,
    ]);
    expect(pickFeeTier(tiers, "fast").minimumFee).toBe(100n);
    expect(pickFeeTier(tiers, "standard")).toEqual({
      finalityThreshold: FINALITY_STANDARD,
      minimumFee: 0n,
      forwardFee: { low: 100n, med: 150n, high: 200n },
    });
  });

  it("throws when Iris has no row for the requested speed", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ finalityThreshold: 2000, minimumFee: 0 }]),
    );
    const tiers = await getBurnFees("testnet", 26, 6);
    expect(() => pickFeeTier(tiers, "fast")).toThrow(ProtocolError);
  });

  it("retries on 5xx then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(502, "bad gateway"))
      .mockResolvedValueOnce(
        jsonResponse([{ finalityThreshold: 1000, minimumFee: 1.3 }]),
      );
    const tiers = await getBurnFees("testnet", 0, 3, { baseDelayMs: 1 });
    expect(tiers).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400", async () => {
    fetchMock.mockResolvedValue(errorResponse(400, "bad request"));
    await expect(
      getBurnFees("testnet", 0, 3, { baseDelayMs: 1 }),
    ).rejects.toBeInstanceOf(IrisHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("pickForwarderFee", () => {
  it("returns the requested level as bigint", () => {
    const tier = {
      finalityThreshold: 1000,
      minimumFee: 130n,
      forwardFee: { low: 100n, med: 200n, high: 300n },
    } as const;
    expect(pickForwarderFee(tier, "low")).toBe(100n);
    expect(pickForwarderFee(tier, "med")).toBe(200n);
    expect(pickForwarderFee(tier, "high")).toBe(300n);
  });

  it("defaults to med", () => {
    const tier = {
      finalityThreshold: 1000,
      minimumFee: 130n,
      forwardFee: { low: 100n, med: 200n, high: 300n },
    } as const;
    expect(pickForwarderFee(tier)).toBe(200n);
  });

  it("throws when tier has no forwardFee", () => {
    const tier = { finalityThreshold: 1000, minimumFee: 130n } as const;
    expect(() => pickForwarderFee(tier)).toThrow(/forwardFee/);
  });
});

describe("getMessages", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns parsed messages", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        messages: [
          {
            message: "0xdeadbeef",
            attestation: "0xcafebabe",
            eventNonce: "1",
            status: "complete",
            cctpVersion: 2,
            forwardState: "CONFIRMED",
            forwardTxHash: "0xabcdef",
          },
        ],
      }),
    );
    const msgs = await getMessages(
      { sourceDomain: 6, transactionHash: "0xabc" },
      { network: "testnet" },
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.status).toBe("complete");
    expect(msgs[0]?.forwardState).toBe("CONFIRMED");
  });

  it("treats 404 as empty list", async () => {
    fetchMock.mockResolvedValue(errorResponse(404, "not found"));
    const msgs = await getMessages(
      { sourceDomain: 6, transactionHash: "0xabc" },
      { network: "testnet", maxRetries: 0 },
    );
    expect(msgs).toEqual([]);
  });

  it("includes transactionHash in the query", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: [] }));
    await getMessages(
      { sourceDomain: 0, transactionHash: "0xfeed" },
      { network: "mainnet" },
    );
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/v2/messages/0");
    expect(url).toContain("transactionHash=0xfeed");
  });
});

describe("injected fetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the fetch it was given instead of the global one", async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal("fetch", globalFetch);
    const injected = vi.fn(async () => jsonResponse({ messages: [] }));
    await getMessages(
      { sourceDomain: 6, transactionHash: "0xabc" },
      { network: "testnet", fetch: injected },
    );
    expect(injected).toHaveBeenCalledOnce();
    expect(globalFetch).not.toHaveBeenCalled();
  });
});

// helpers
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
function errorResponse(status: number, body: string): Response {
  return new Response(body, { status });
}
