import { describe, expect, it } from "vitest";
import { ScreeningError } from "../errors/index.js";
import { assertScreened, createCloudApi, type TokenSource } from "./api.js";

const CLOUD = "https://api.whisk.test";
const TRANSFER = "trf_0123456789ABCDEFGHJKMNPQRS";

interface Call {
  url: string;
  method: string | undefined;
  auth: string | null;
  body: unknown;
}

function fakeFetch(respond: (call: Call, n: number) => Response | Error) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    const call: Call = {
      url: typeof input === "string" ? input : String(input),
      method: init?.method,
      auth: new Headers(init?.headers).get("authorization"),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const answer = respond(call, calls.length);
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer);
  };
  return { fetch, calls };
}

function tokens(...values: (string | undefined)[]): TokenSource & {
  fresh: number;
} {
  let i = 0;
  const source = {
    fresh: 0,
    token(options?: { fresh?: boolean }) {
      if (options?.fresh) {
        source.fresh += 1;
        i += 1;
      }
      return Promise.resolve(values[Math.min(i, values.length - 1)]);
    },
  };
  return source;
}

const parties = {
  payer: { chain: "Base_Sepolia", address: "0xabc" },
  recipient: { chain: "Solana_Devnet", address: "Recipient111" },
} as const;

const report = {
  sourceChain: "Base_Sepolia",
  burnTxHash: `0x${"ab".repeat(32)}`,
  clientTransferId: "8d5f0d9a-6a4e-4d5c-9d3f-2b1f6f1f2a3b",
} as const;

const reported = {
  id: TRANSFER,
  state: "reported",
  recoveryUrl: `https://dashboard.whisk.test/r/${TRANSFER}`,
};

describe("screen", () => {
  it("posts the payer and recipient with the session token and returns the answer", async () => {
    const { fetch, calls } = fakeFetch(() => Response.json({ result: "hit" }));
    const api = createCloudApi({
      session: tokens("t1"),
      cloudUrl: CLOUD,
      fetch,
    });
    expect(await api.screen(parties)).toBe("hit");
    expect(calls).toEqual([
      {
        url: `${CLOUD}/v1/screen`,
        method: "POST",
        auth: "Bearer t1",
        body: parties,
      },
    ]);
  });

  it.each([
    [
      "no verified session",
      undefined,
      () => Response.json({ result: "clear" }),
    ],
    ["a network error", "t1", () => new TypeError("fetch failed")],
    ["a 500", "t1", () => new Response("", { status: 500 })],
    ["a 429", "t1", () => new Response("", { status: 429 })],
    ["an unknown result", "t1", () => Response.json({ result: "maybe" })],
    ["a body that is not JSON", "t1", () => new Response("<html>")],
  ])("is unavailable with %s", async (_, token, respond) => {
    const { fetch, calls } = fakeFetch(respond);
    const api = createCloudApi({
      session: tokens(token),
      cloudUrl: CLOUD,
      fetch,
    });
    expect(await api.screen(parties)).toBe("unavailable");
    if (token === undefined) expect(calls).toEqual([]);
  });

  it("is unavailable when Whisk Cloud is slower than the timeout", async () => {
    const fetch: typeof globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "TimeoutError"));
        });
      });
    const api = createCloudApi({
      session: tokens("t1"),
      cloudUrl: CLOUD,
      fetch,
      screenTimeoutMs: 20,
    });
    expect(await api.screen(parties)).toBe("unavailable");
  });
});

describe("assertScreened", () => {
  it("refuses a hit with a message that names nobody", () => {
    const error = (() => {
      try {
        assertScreened("hit", false);
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(ScreeningError);
    expect(error).toMatchObject({
      code: "SCREENING_REFUSED",
      reason: "hit",
      retryable: false,
      message: "This payment can't be completed.",
    });
  });

  it("lets a partial or unavailable screen through unless the app fails closed", () => {
    for (const outcome of ["clear", "partial", "unavailable"] as const) {
      expect(() => assertScreened(outcome, false)).not.toThrow();
    }
    expect(() => assertScreened("clear", true)).not.toThrow();
    for (const outcome of ["partial", "unavailable"] as const) {
      expect(() => assertScreened(outcome, true)).toThrow(
        expect.objectContaining({ reason: "unscreened" }),
      );
    }
  });
});

describe("report", () => {
  it("posts the burn with the session token and returns the transfer", async () => {
    const { fetch, calls } = fakeFetch(() =>
      Response.json(reported, { status: 201 }),
    );
    const api = createCloudApi({
      session: tokens("t1"),
      cloudUrl: CLOUD,
      fetch,
    });
    expect(await api.report(report)).toEqual(reported);
    expect(calls).toEqual([
      {
        url: `${CLOUD}/v1/transfers`,
        method: "POST",
        auth: "Bearer t1",
        body: report,
      },
    ]);
  });

  it("retries a network error, a 5xx or a 429 with backoff, then succeeds", async () => {
    const answers = [
      new TypeError("fetch failed"),
      new Response("", { status: 503 }),
      new Response("", { status: 429 }),
      Response.json(reported),
    ];
    const { fetch, calls } = fakeFetch((_, n) => answers[n - 1] ?? new Error());
    const waits: number[] = [];
    const api = createCloudApi({
      session: tokens("t1"),
      cloudUrl: CLOUD,
      fetch,
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    expect(await api.report(report)).toEqual(reported);
    expect(calls).toHaveLength(4);
    expect(waits).toEqual([2_000, 4_000, 8_000]);
  });

  it("gives up after a few minutes with a warning, and never throws", async () => {
    const { fetch, calls } = fakeFetch(() => new Response("", { status: 503 }));
    const waits: number[] = [];
    const warnings: string[] = [];
    const api = createCloudApi({
      session: tokens("t1"),
      cloudUrl: CLOUD,
      fetch,
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
      warn: (message) => warnings.push(message),
    });
    expect(await api.report(report)).toBeUndefined();
    expect(calls).toHaveLength(7);
    expect(waits.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(5 * 60_000);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/not reported/);
  });

  it("does not retry a report Whisk Cloud refused, and warns", async () => {
    const { fetch, calls } = fakeFetch(() =>
      Response.json({ error: { code: "network_mismatch" } }, { status: 400 }),
    );
    const warnings: string[] = [];
    const api = createCloudApi({
      session: tokens("t1"),
      cloudUrl: CLOUD,
      fetch,
      sleep: () => Promise.resolve(),
      warn: (message) => warnings.push(message),
    });
    expect(await api.report(report)).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(warnings[0]).toMatch(/network_mismatch/);
  });

  it("takes a fresh session token once when the old one is refused", async () => {
    const { fetch, calls } = fakeFetch((call) =>
      call.auth === "Bearer old"
        ? new Response("", { status: 401 })
        : Response.json(reported),
    );
    const session = tokens("old", "new");
    const api = createCloudApi({
      session,
      cloudUrl: CLOUD,
      fetch,
      sleep: () => Promise.resolve(),
    });
    expect(await api.report(report)).toEqual(reported);
    expect(calls.map((c) => c.auth)).toEqual(["Bearer old", "Bearer new"]);
    expect(session.fresh).toBe(1);
  });

  it("sends nothing without a verified session", async () => {
    const { fetch, calls } = fakeFetch(() => Response.json(reported));
    const api = createCloudApi({
      session: tokens(undefined),
      cloudUrl: CLOUD,
      fetch,
    });
    expect(await api.report(report)).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("treats an answer it cannot read as not reported", async () => {
    const { fetch } = fakeFetch(() => Response.json({ id: "nope" }));
    const warnings: string[] = [];
    const api = createCloudApi({
      session: tokens("t1"),
      cloudUrl: CLOUD,
      fetch,
      sleep: () => Promise.resolve(),
      warn: (message) => warnings.push(message),
    });
    expect(await api.report(report)).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });
});
