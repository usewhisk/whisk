import type { BurnFeeTier, IrisMessage } from "@usewhisk/cctp";

export type IrisRequest = {
  method: string;
  url: URL;
};

export type IrisReply = { message: IrisMessage } | { status: number };

export type FakeIris = {
  fetch: typeof fetch;
  readonly requests: readonly IrisRequest[];
  setFees(sourceDomain: number, destinationDomain: number, rows: unknown): void;
  /** Queued in order. The last reply repeats once the queue drains. */
  replyToMessages(...replies: IrisReply[]): void;
  replyToReattest(...replies: IrisReply[]): void;
};

export const FAST_FEE_ROW: BurnFeeTier = {
  finalityThreshold: 1000,
  minimumFee: 1.3,
  forwardFee: { low: 100_000, med: 250_000, high: 500_000 },
};

export const STANDARD_FEE_ROW = {
  finalityThreshold: 2000,
  minimumFee: 0,
  forwardFee: { low: 100_000, med: 250_000, high: 500_000 },
};

const IRIS_HOSTS = new Set([
  "iris-api.circle.com",
  "iris-api-sandbox.circle.com",
]);

export function createFakeIris(): FakeIris {
  const requests: IrisRequest[] = [];
  const fees = new Map<string, unknown>();
  const messageReplies: IrisReply[] = [];
  const reattestReplies: IrisReply[] = [];

  function next(queue: IrisReply[]): IrisReply | undefined {
    return queue.length > 1 ? queue.shift() : queue[0];
  }

  function reply(r: IrisReply | undefined): Response {
    if (!r) return json(404, { error: "Message not found" });
    if ("status" in r) return json(r.status, { error: `status ${r.status}` });
    return json(200, { messages: [r.message] });
  }

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    const method = (init?.method ?? "GET").toUpperCase();
    requests.push({ method, url });

    // 400 rather than 5xx so the Iris client fails at once instead of retrying.
    if (!IRIS_HOSTS.has(url.host)) {
      return json(400, { error: `fake iris: unknown host ${url.host}` });
    }

    const feesPath = url.pathname.match(
      /^\/v2\/burn\/USDC\/fees\/(\d+)\/(\d+)$/,
    );
    if (feesPath && method === "GET") {
      const rows = fees.get(`${feesPath[1]}:${feesPath[2]}`) ?? [
        FAST_FEE_ROW,
        STANDARD_FEE_ROW,
      ];
      return json(200, rows);
    }
    if (/^\/v2\/messages\/\d+$/.test(url.pathname) && method === "GET") {
      return reply(next(messageReplies));
    }
    if (/^\/v2\/reattest\/[^/]+$/.test(url.pathname) && method === "POST") {
      return reply(next(reattestReplies));
    }
    return json(400, {
      error: `fake iris: no route for ${method} ${url.pathname}`,
    });
  };

  return {
    fetch: fakeFetch,
    requests,
    setFees(sourceDomain, destinationDomain, rows) {
      fees.set(`${sourceDomain}:${destinationDomain}`, rows);
    },
    replyToMessages(...replies) {
      messageReplies.splice(0, messageReplies.length, ...replies);
    },
    replyToReattest(...replies) {
      reattestReplies.splice(0, reattestReplies.length, ...replies);
    },
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
