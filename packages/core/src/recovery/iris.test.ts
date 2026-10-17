import { afterEach, describe, expect, it, vi } from "vitest";
import type { IrisMessage as CctpIrisMessage } from "@usewhisk/cctp";
import type { Chain } from "../types/chain.js";
import { createFakeIris } from "../test/harness/index.js";
import {
  IRIS_MAINNET_URL,
  IRIS_SANDBOX_URL,
  fetchAttestationOnce,
  getIrisBaseUrl,
  pollAttestation,
} from "./iris.js";

type FakeResponse = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
};

function stubFetch(...responses: FakeResponse[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      statusText: r.statusText ?? "OK",
      json: r.json ?? (async () => ({})),
    });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getIrisBaseUrl", () => {
  it("returns sandbox URL for testnet chains", () => {
    expect(getIrisBaseUrl("Arc_Testnet")).toBe(IRIS_SANDBOX_URL);
  });

  it("returns mainnet URL for mainnet chains", () => {
    expect(getIrisBaseUrl("Base")).toBe(IRIS_MAINNET_URL);
  });
});

describe("fetchAttestationOnce", () => {
  it("returns not_found when the source chain has no CCTP domain", async () => {
    // Every chain in the registry now has a CCTP domain, so to exercise the
    // early-return branch we synthesize a chain string that isn't in the map.
    const fetchMock = stubFetch();
    const msg = await fetchAttestationOnce("__no_domain__" as Chain, "0xburn");
    expect(msg.status).toBe("not_found");
    // Iris should never have been called.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns not_found on HTTP 404", async () => {
    stubFetch({ ok: false, status: 404 });
    const msg = await fetchAttestationOnce("Arc_Testnet", "0xdeadbeef");
    expect(msg.status).toBe("not_found");
  });

  it("parses a complete message response", async () => {
    stubFetch({
      json: async () => ({
        messages: [
          {
            status: "complete",
            message: "0xabcd",
            attestation: "0x1234",
            eventNonce: "42",
          },
        ],
      }),
    });
    const msg = await fetchAttestationOnce("Arc_Testnet", "0xburn");
    expect(msg.status).toBe("complete");
    expect(msg.message).toBe("0xabcd");
    expect(msg.attestation).toBe("0x1234");
    expect(msg.eventNonce).toBe("42");
  });

  it("returns not_found when Iris responds without a messages entry", async () => {
    stubFetch({ json: async () => ({}) });
    const msg = await fetchAttestationOnce("Arc_Testnet", "0xburn");
    expect(msg.status).toBe("not_found");
  });

  it("throws on non-OK non-404 responses", async () => {
    // Iris client retries 5xx with backoff before giving up, so the
    // stub needs to fail every attempt.
    const failing: FakeResponse = {
      ok: false,
      status: 500,
      statusText: "Server Error",
    };
    stubFetch(failing, failing, failing, failing, failing);
    await expect(fetchAttestationOnce("Arc_Testnet", "0xburn")).rejects.toThrow(
      /Iris/,
    );
  });
});

describe("pollAttestation", () => {
  it("transitions pending → complete and resolves with the terminal message", async () => {
    stubFetch(
      {
        json: async () => ({ messages: [{ status: "pending_confirmations" }] }),
      },
      {
        json: async () => ({
          messages: [
            { status: "complete", message: "0xa", attestation: "0xb" },
          ],
        }),
      },
    );
    const onUpdate = vi.fn();
    const final = await pollAttestation("Arc_Testnet", "0xburn", {
      pollingInterval: 1,
      timeout: 1000,
      onUpdate,
    });
    expect(final.status).toBe("complete");
    expect(final.message).toBe("0xa");
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate.mock.calls[0]![0].status).toBe("pending_confirmations");
    expect(onUpdate.mock.calls[1]![0].status).toBe("complete");
  });

  it("returns 'failed' immediately and stops polling further", async () => {
    const fetchMock = stubFetch({
      json: async () => ({ messages: [{ status: "failed" }] }),
    });
    const result = await pollAttestation("Arc_Testnet", "0xburn", {
      pollingInterval: 1,
      timeout: 1000,
    });
    expect(result.status).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the latest message when the timeout elapses without terminal status", async () => {
    // Always pending; polling should give up after the timeout.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        messages: [{ status: "pending_confirmations" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await pollAttestation("Arc_Testnet", "0xburn", {
      pollingInterval: 5,
      timeout: 25,
    });
    expect(result.status).toBe("pending_confirmations");
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("non-EVM source domains", () => {
  const COMPLETE: CctpIrisMessage = {
    message: "0x11",
    attestation: "0x22",
    eventNonce: "3",
    status: "complete",
    cctpVersion: 2,
  };

  it.each([
    ["Stellar", 27],
    ["Starknet", 25],
  ] as const)(
    "asks Iris about a %s burn on domain %i",
    async (chain, domain) => {
      const iris = createFakeIris();
      iris.replyToMessages({ message: COMPLETE });
      const msg = await fetchAttestationOnce(chain, "0xburn", {
        fetch: iris.fetch,
      });
      expect(msg.status).toBe("complete");
      expect(iris.requests.map((r) => r.url.pathname)).toEqual([
        `/v2/messages/${domain}`,
      ]);
    },
  );
});
