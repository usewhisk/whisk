import { encodeAbiParameters, toFunctionSelector } from "viem";
import { xdr } from "@stellar/stellar-sdk";
import type { BurnFeeTier, IrisMessage } from "@usewhisk/cctp";

export type IrisRequest = {
  method: string;
  url: URL;
};

export type IrisReply = { message: IrisMessage } | { status: number };

/**
 * A signed-quote reply. By default the fee is Iris's rate on the amount
 * (1.3 bps for `PRE_FINALITY`, `med` for `FORWARD`) and the quote lasts 60
 * blocks past the current one.
 */
export type QuoteReply =
  | { fee?: bigint; expiresAtBlock?: number }
  | { status: number; errorCode: string };

export type QuoteRequest = {
  sourceDomain: number;
  destinationDomain: number;
  body: {
    amount: string;
    feeToken?: string;
    requests: { type: string }[];
  };
};

export type FakeIris = {
  fetch: typeof fetch;
  readonly requests: readonly IrisRequest[];
  setFees(sourceDomain: number, destinationDomain: number, rows: unknown): void;
  /** Queued in order. The last reply repeats once the queue drains. */
  replyToMessages(...replies: IrisReply[]): void;
  /** A `{ message }` reply acknowledges; a `{ status }` reply is an error. */
  replyToReattest(...replies: IrisReply[]): void;
  /** Nonces every MessageTransmitterV2 reports as used. */
  setNonceUsed(nonce: `0x${string}`): void;
  /**
   * What every TokenMessengerV2 answers to `getMinFeeAmount` over JSON-RPC.
   * Defaults to 0, which every chain returns.
   */
  setStandardMinFee(fee: bigint): void;
  readonly quoteRequests: readonly QuoteRequest[];
  /** Queued in order. The last reply repeats once the queue drains. */
  replyToQuote(...replies: QuoteReply[]): void;
  /** Circle's remaining Fast allowance, in USDC subunits. */
  setFastAllowance(subunits: bigint): void;
  /** What every chain answers to `eth_blockNumber`. Defaults to 100. */
  setBlockNumber(block: number): void;
  /** What every chain answers to `eth_gasPrice`, in wei. Defaults to 25 gwei. */
  setGasPrice(wei: bigint): void;
  /**
   * What every USDC contract answers to `balanceOf(owner)`, in subunits.
   * Owners not set hold 1,000,000 USDC.
   */
  setUsdcBalance(owner: `0x${string}`, subunits: bigint): void;
  /** Starknet addresses with no contract. Every other address is deployed. */
  setStarknetUndeployed(address: string): void;
};

/**
 * The fake's `signedQuote`: a version byte, then the fee and amount, so the
 * fake wallet can charge what was quoted.
 */
export function fakeSignedQuote(fee: bigint, amount: bigint): `0x${string}` {
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }],
    [fee, amount],
  );
  return `0x01${encoded.slice(2)}`;
}

export const FAST_FEE_ROW = {
  finalityThreshold: 1000,
  minimumFee: 1.3,
  forwardFee: { low: 100_000, med: 250_000, high: 500_000 },
};

/** {@link FAST_FEE_ROW} as `getBurnFees` parses it. */
export const FAST_FEE_TIER: BurnFeeTier = {
  finalityThreshold: 1000,
  minimumFee: 130n,
  forwardFee: { low: 100_000n, med: 250_000n, high: 500_000n },
};

export const STANDARD_FEE_ROW = {
  finalityThreshold: 2000,
  minimumFee: 0,
  forwardFee: { low: 100_000, med: 250_000, high: 500_000 },
};

const GET_MIN_FEE_AMOUNT = "0x516990e3";
const USED_NONCES = toFunctionSelector("usedNonces(bytes32)");
const BALANCE_OF = toFunctionSelector("balanceOf(address)");

const IRIS_HOSTS = new Set([
  "iris-api.circle.com",
  "iris-api-sandbox.circle.com",
]);

export function createFakeIris(): FakeIris {
  const requests: IrisRequest[] = [];
  const fees = new Map<string, unknown>();
  const messageReplies: IrisReply[] = [];
  const reattestReplies: IrisReply[] = [];
  const usedNonces = new Set<string>();
  const usdcBalances = new Map<string, bigint>();
  const undeployed = new Set<bigint>();
  let standardMinFee = 0n;
  const quoteRequests: QuoteRequest[] = [];
  const quoteReplies: QuoteReply[] = [];
  let fastAllowance = 10n ** 15n;
  let blockNumber = 100;
  let gasPrice = 25_000_000_000n;

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

    if (method === "POST" && typeof init?.body === "string") {
      const rpc = JSON.parse(init.body) as {
        id?: number;
        method?: string;
        params?: [{ data?: string }];
      };
      // The fake wallet mines every call it is sent.
      if (rpc.method === "eth_getTransactionReceipt") {
        return json(200, {
          jsonrpc: "2.0",
          id: rpc.id ?? 1,
          result: { status: "0x1" },
        });
      }
      if (rpc.method === "eth_gasPrice") {
        return json(200, {
          jsonrpc: "2.0",
          id: rpc.id ?? 1,
          result: `0x${gasPrice.toString(16)}`,
        });
      }
      if (rpc.method === "eth_blockNumber") {
        return json(200, {
          jsonrpc: "2.0",
          id: rpc.id ?? 1,
          result: `0x${blockNumber.toString(16)}`,
        });
      }
      // Stellar's is_nonce_used is read by simulating a transaction that
      // carries the nonce bytes; Starknet's takes it as a low/high u256.
      if (rpc.method === "simulateTransaction") {
        const tx = Buffer.from(
          String(
            (rpc.params as unknown as { transaction: string }).transaction,
          ),
          "base64",
        );
        const used = [...usedNonces].some((n) =>
          tx.includes(Buffer.from(n.slice(2), "hex")),
        );
        return json(200, {
          jsonrpc: "2.0",
          id: rpc.id ?? 1,
          result: {
            results: [{ xdr: xdr.ScVal.scvBool(used).toXDR("base64") }],
          },
        });
      }
      if (rpc.method === "starknet_call") {
        const [low, high] = (
          rpc.params as unknown as { request: { calldata: string[] } }
        ).request.calldata;
        const nonce = `0x${high!.slice(2).padStart(32, "0")}${low!.slice(2).padStart(32, "0")}`;
        return json(200, {
          jsonrpc: "2.0",
          id: rpc.id ?? 1,
          result: [usedNonces.has(nonce) ? "0x1" : "0x0"],
        });
      }
      if (rpc.method === "starknet_getClassHashAt") {
        const { contract_address } = rpc.params as unknown as {
          contract_address: string;
        };
        if (undeployed.has(BigInt(contract_address))) {
          return json(200, {
            jsonrpc: "2.0",
            id: rpc.id ?? 1,
            error: { code: 20, message: "Contract not found" },
          });
        }
        return json(200, {
          jsonrpc: "2.0",
          id: rpc.id ?? 1,
          result: `0x${"7a".repeat(31)}`,
        });
      }
      const callData = rpc.params?.[0]?.data;
      if (rpc.method === "eth_call" && callData?.startsWith(BALANCE_OF)) {
        const owner = `0x${callData.slice(-40)}`.toLowerCase();
        const held = usdcBalances.get(owner) ?? 1_000_000_000_000n;
        return json(200, {
          jsonrpc: "2.0",
          id: rpc.id ?? 1,
          result: `0x${held.toString(16).padStart(64, "0")}`,
        });
      }
      if (rpc.method === "eth_call" && callData?.startsWith(USED_NONCES)) {
        const nonce = `0x${callData.slice(10)}`.toLowerCase();
        return json(200, {
          jsonrpc: "2.0",
          id: rpc.id ?? 1,
          result: `0x${(usedNonces.has(nonce) ? 1 : 0).toString(16).padStart(64, "0")}`,
        });
      }
      if (
        rpc.method === "eth_call" &&
        rpc.params?.[0]?.data?.startsWith(GET_MIN_FEE_AMOUNT)
      ) {
        return json(200, {
          jsonrpc: "2.0",
          id: rpc.id ?? 1,
          result: `0x${standardMinFee.toString(16).padStart(64, "0")}`,
        });
      }
    }

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
    const quotePath = url.pathname.match(
      /^\/v2\/quote\/burn\/usdc\/(\d+)\/(\d+)$/,
    );
    if (quotePath && method === "POST") {
      const body = JSON.parse(String(init?.body)) as QuoteRequest["body"];
      quoteRequests.push({
        sourceDomain: Number(quotePath[1]),
        destinationDomain: Number(quotePath[2]),
        body,
      });
      const r =
        quoteReplies.length > 1 ? quoteReplies.shift() : quoteReplies[0];
      if (r && "status" in r) {
        return json(r.status, { errorCode: r.errorCode, error: r.errorCode });
      }
      const amount = BigInt(body.amount);
      const items = body.requests.map(({ type }) => ({
        type,
        amount:
          type === "PRE_FINALITY"
            ? (amount * 130n + 999_999n) / 1_000_000n
            : 250_000n,
        args: [],
        argsHash: `0x${"00".repeat(32)}`,
      }));
      const fee = r?.fee ?? items.reduce((sum, i) => sum + i.amount, 0n);
      // An override puts the whole fee on the first item so they still add up.
      if (r?.fee !== undefined) {
        items.forEach((item, i) => (item.amount = i === 0 ? fee : 0n));
      }
      return json(200, {
        signedQuote: fakeSignedQuote(fee, amount),
        issuedAt: 1_783_407_750,
        expiry: {
          mode: "BLOCK_NUMBER",
          expiresAtBlock: r?.expiresAtBlock ?? blockNumber + 60,
          blockEstimatedAt: 1_783_407_870,
        },
        feeTotalAmount: fee.toString(),
        burnAmount: body.amount,
        feeToken: body.feeToken,
        items: items.map((i) => ({ ...i, amount: i.amount.toString() })),
        nonce: "0",
      });
    }
    if (url.pathname === "/v2/fastBurn/USDC/allowance" && method === "GET") {
      const whole = fastAllowance / 1_000_000n;
      const frac = (fastAllowance % 1_000_000n).toString().padStart(6, "0");
      // Iris sends the allowance as a JSON number of whole USDC.
      return new Response(
        `{"allowance":${whole}.${frac},"lastUpdated":"2026-10-18T14:03:27.355Z"}`,
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (/^\/v2\/messages\/\d+$/.test(url.pathname) && method === "GET") {
      return reply(next(messageReplies));
    }
    const reattestPath = url.pathname.match(/^\/v2\/reattest\/([^/]+)$/);
    if (reattestPath && method === "POST") {
      const r = next(reattestReplies);
      if (!r) return json(404, { error: "Message not found" });
      if ("status" in r) return json(r.status, { error: `status ${r.status}` });
      return json(200, {
        message: "Re-attestation successfully requested for nonce.",
        nonce: reattestPath[1],
      });
    }
    return json(400, {
      error: `fake iris: no route for ${method} ${url.pathname}`,
    });
  };

  return {
    fetch: fakeFetch,
    requests,
    setStandardMinFee(fee) {
      standardMinFee = fee;
    },
    quoteRequests,
    replyToQuote(...replies) {
      quoteReplies.splice(0, quoteReplies.length, ...replies);
    },
    setFastAllowance(subunits) {
      fastAllowance = subunits;
    },
    setBlockNumber(block) {
      blockNumber = block;
    },
    setGasPrice(wei) {
      gasPrice = wei;
    },
    setUsdcBalance(owner, subunits) {
      usdcBalances.set(owner.toLowerCase(), subunits);
    },
    setStarknetUndeployed(address) {
      undeployed.add(BigInt(address));
    },
    setFees(sourceDomain, destinationDomain, rows) {
      fees.set(`${sourceDomain}:${destinationDomain}`, rows);
    },
    replyToMessages(...replies) {
      messageReplies.splice(0, messageReplies.length, ...replies);
    },
    setNonceUsed(nonce) {
      usedNonces.add(nonce.toLowerCase());
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
