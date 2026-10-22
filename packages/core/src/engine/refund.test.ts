import { beforeEach, describe, expect, it } from "vitest";
import type { IrisMessage } from "@usewhisk/cctp";
import { Base } from "@usewhisk/cctp";
import type { WhiskConfig } from "../types/config.js";
import { REFUND_OF_TX_KEY, REFUND_REASON_KEY } from "../refund/index.js";
import { ConfigError } from "../errors/errors.js";
import { createWhisk as createEngine } from "./createWhisk.js";
import {
  createFakeEvmWallet,
  createFakeIris,
  type FakeIris,
} from "../test/harness/index.js";

const FORWARDED_MESSAGE: IrisMessage = {
  message: ("0x" + "11".repeat(32)) as `0x${string}`,
  attestation: ("0x" + "22".repeat(65)) as `0x${string}`,
  eventNonce: "1",
  status: "complete",
  cctpVersion: 2,
  forwardState: "COMPLETE",
  forwardTxHash: "0xff".padEnd(66, "f"),
};

const MERCHANT_WALLET =
  "0x0000000000000000000000000000000000000010" as `0x${string}`;
const ORIGINAL_SENDER = "0x0000000000000000000000000000000000000020";
const ORIGINAL_TX = ("0x" + "ab".repeat(32)) as `0x${string}`;

let iris: FakeIris;
beforeEach(() => {
  iris = createFakeIris();
  iris.replyToMessages({ message: FORWARDED_MESSAGE });
});

const createWhisk = (config: WhiskConfig) =>
  createEngine({ ...config, fetch: iris.fetch });

function makeAdapter() {
  const wallet = createFakeEvmWallet({
    address: MERCHANT_WALLET,
    chainId: Base.evmChainId,
  });
  wallet.fund(Base.evmChainId, Base.usdc, 100_000_000n);
  return { adapter: wallet.adapter, wallet };
}

describe("engine.refund", () => {
  it("dispatches a same-chain USDC transfer from merchant to original sender", async () => {
    const engine = createWhisk({ chains: ["Base"] });
    const { adapter, wallet } = makeAdapter();
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
      expect(result.finalTxHash).toBeDefined();
    }
    // No bridge, a single USDC transfer back to the payer.
    expect(wallet.batches).toHaveLength(1);
    expect(wallet.transfers).toEqual([
      {
        chainId: Base.evmChainId,
        token: Base.usdc,
        to: ORIGINAL_SENDER,
        amount: 5_250_000n,
      },
    ]);
    expect(wallet.burns).toHaveLength(0);
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
    const { adapter, wallet } = makeAdapter();
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
    const firstBatch = wallet.batches[0] ?? [];
    expect(firstBatch).toHaveLength(2);
    expect(firstBatch[0]?.to).toBe(Base.usdc);
    // The merchant pays the fees upfront, so the payer gets the whole refund.
    expect(firstBatch[1]?.to).toBe(Base.tokenMessengerWithFees);
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
