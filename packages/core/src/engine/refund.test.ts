/**
 * End-to-end refund — verifies the engine validates input, stamps the
 * Whisk-internal correlation keys (`__refundOfTxHash`, `__refundReason`)
 * onto the result, and dispatches through the same Send / Bridge path
 * as a regular transfer.
 */
import { describe, expect, it, vi } from "vitest";
import type { BurnFeeTier, IrisMessage } from "@usewhisk/cctp";
import { Base } from "@usewhisk/cctp";
import type { EvmAdapter, EvmCall } from "./adapter.js";
import { REFUND_OF_TX_KEY, REFUND_REASON_KEY } from "../refund/index.js";
import { ConfigError } from "../errors/errors.js";

const FAST_TIER: BurnFeeTier = {
  finalityThreshold: 1000,
  minimumFee: 1.3,
  forwardFee: { low: 100_000, med: 250_000, high: 500_000 },
};

const FORWARDED_MESSAGE: IrisMessage = {
  message: ("0x" + "11".repeat(32)) as `0x${string}`,
  attestation: ("0x" + "22".repeat(65)) as `0x${string}`,
  eventNonce: "1",
  status: "complete",
  cctpVersion: 2,
  forwardState: "COMPLETE",
  forwardTxHash: "0xff".padEnd(66, "f"),
};

vi.mock("@usewhisk/cctp", async () => {
  const actual =
    await vi.importActual<typeof import("@usewhisk/cctp")>("@usewhisk/cctp");
  return {
    ...actual,
    getBurnFees: vi.fn(async () => [FAST_TIER]),
    pollMessages: vi.fn(async () => FORWARDED_MESSAGE),
  };
});

const { createWhisk } = await import("./createWhisk.js");

const MERCHANT_WALLET =
  "0x0000000000000000000000000000000000000010" as `0x${string}`;
const ORIGINAL_SENDER = "0x0000000000000000000000000000000000000020";
const ORIGINAL_TX = ("0x" + "ab".repeat(32)) as `0x${string}`;
const REFUND_HASH =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as `0x${string}`;

function makeAdapter() {
  const sendCallsSpy = vi.fn(async (calls: EvmCall[]) => ({
    hashes: calls.map((_, i) =>
      i === calls.length - 1
        ? REFUND_HASH
        : (("0xaa" + "".padEnd(64, "a")) as `0x${string}`),
    ),
  }));
  const adapter: EvmAdapter = {
    kind: "evm",
    address: MERCHANT_WALLET,
    async getChainId() {
      return Base.evmChainId;
    },
    async switchChain() {},
    sendCalls: sendCallsSpy,
    async waitForReceipt() {
      return { status: "success" as const, blockNumber: 1n };
    },
  };
  return { adapter, sendCallsSpy };
}

describe("engine.refund", () => {
  it("dispatches a same-chain USDC transfer from merchant to original sender", async () => {
    const engine = createWhisk({ chains: ["Base"] });
    const { adapter, sendCallsSpy } = makeAdapter();
    const result = await engine.refund({
      originalTxHash: ORIGINAL_TX,
      originalDestinationChain: "Base",
      refundDestinationChain: "Base",
      originalSenderAddress: ORIGINAL_SENDER,
      amount: "5.25",
      merchantAdapter: adapter,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.finalTxHash).toBe(REFUND_HASH);
      // No bridge — single-call transfer.
      expect(sendCallsSpy).toHaveBeenCalledOnce();
      const calls = sendCallsSpy.mock.calls[0]?.[0] ?? [];
      expect(calls).toHaveLength(1);
      expect(calls[0]?.to).toBe(Base.usdc);
      // ERC-20 transfer selector.
      expect(calls[0]?.data.startsWith("0xa9059cbb")).toBe(true);
    }
  });

  it("stamps __refundOfTxHash and __refundReason on the result metadata", async () => {
    const engine = createWhisk({ chains: ["Base"] });
    const { adapter } = makeAdapter();
    const result = await engine.refund({
      originalTxHash: ORIGINAL_TX,
      originalDestinationChain: "Base",
      refundDestinationChain: "Base",
      originalSenderAddress: ORIGINAL_SENDER,
      amount: "5",
      reason: "out_of_stock",
      merchantAdapter: adapter,
    });
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.[REFUND_OF_TX_KEY]).toBe(ORIGINAL_TX);
    expect(result.metadata?.[REFUND_REASON_KEY]).toBe("out_of_stock");
  });

  it("omits __refundReason when no reason is given", async () => {
    const engine = createWhisk({ chains: ["Base"] });
    const result = await engine.refund({
      originalTxHash: ORIGINAL_TX,
      originalDestinationChain: "Base",
      refundDestinationChain: "Base",
      originalSenderAddress: ORIGINAL_SENDER,
      amount: "5",
      merchantAdapter: makeAdapter().adapter,
    });
    expect(result.metadata?.[REFUND_OF_TX_KEY]).toBe(ORIGINAL_TX);
    expect(result.metadata?.[REFUND_REASON_KEY]).toBeUndefined();
  });

  it("merges config.defaultMetadata + per-call metadata + refund keys", async () => {
    const engine = createWhisk({
      chains: ["Base"],
      defaultMetadata: { app: "demo" },
    });
    const result = await engine.refund({
      originalTxHash: ORIGINAL_TX,
      originalDestinationChain: "Base",
      refundDestinationChain: "Base",
      originalSenderAddress: ORIGINAL_SENDER,
      amount: "5",
      reason: "duplicate_charge",
      metadata: { orderId: "ord_42" },
      merchantAdapter: makeAdapter().adapter,
    });
    expect(result.metadata).toMatchObject({
      app: "demo",
      orderId: "ord_42",
      [REFUND_OF_TX_KEY]: ORIGINAL_TX,
      [REFUND_REASON_KEY]: "duplicate_charge",
    });
  });

  it("routes through a Bridge when refundDestinationChain differs from originalDestinationChain", async () => {
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const { adapter, sendCallsSpy } = makeAdapter();
    const result = await engine.refund({
      originalTxHash: ORIGINAL_TX,
      originalDestinationChain: "Base",
      refundDestinationChain: "Arbitrum",
      originalSenderAddress: ORIGINAL_SENDER,
      amount: "5",
      merchantAdapter: adapter,
    });
    expect(result.kind).toBe("success");
    // Bridge submission: [approve, burn]
    const firstBatch = sendCallsSpy.mock.calls[0]?.[0] ?? [];
    expect(firstBatch).toHaveLength(2);
    expect(firstBatch[0]?.to).toBe(Base.usdc);
    expect(firstBatch[1]?.to).toBe(Base.tokenMessenger);
  });

  it("rejects refunds with a missing originalTxHash", async () => {
    const engine = createWhisk({ chains: ["Base"] });
    await expect(
      engine.refund({
        originalTxHash: "",
        originalDestinationChain: "Base",
        refundDestinationChain: "Base",
        originalSenderAddress: ORIGINAL_SENDER,
        amount: "5",
        merchantAdapter: makeAdapter().adapter,
      }),
    ).rejects.toThrow(ConfigError);
  });

  it("rejects refunds with a non-positive amount", async () => {
    const engine = createWhisk({ chains: ["Base"] });
    await expect(
      engine.refund({
        originalTxHash: ORIGINAL_TX,
        originalDestinationChain: "Base",
        refundDestinationChain: "Base",
        originalSenderAddress: ORIGINAL_SENDER,
        amount: "0",
        merchantAdapter: makeAdapter().adapter,
      }),
    ).rejects.toThrow(ConfigError);
  });

  it("rejects merchant metadata that uses the reserved __ prefix", async () => {
    const engine = createWhisk({ chains: ["Base"] });
    await expect(
      engine.refund({
        originalTxHash: ORIGINAL_TX,
        originalDestinationChain: "Base",
        refundDestinationChain: "Base",
        originalSenderAddress: ORIGINAL_SENDER,
        amount: "5",
        metadata: { __reserved: "nope" },
        merchantAdapter: makeAdapter().adapter,
      }),
    ).rejects.toThrow(ConfigError);
  });
});
