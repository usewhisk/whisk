import { describe, expect, it } from "vitest";
import type { Chain } from "../types/chain.js";
import { ConfigError } from "../errors/errors.js";
import {
  REFUND_OF_TX_KEY,
  REFUND_REASON_KEY,
  buildRefundMetadata,
  validateRefundInput,
} from "./index.js";

const TX = "0x" + "11".repeat(32);
const ORIGINAL_DEST = "Arc_Testnet" as Chain;
const REFUND_DEST = "Base_Sepolia" as Chain;
const SENDER = "0x000000000000000000000000000000000000cafe";

describe("validateRefundInput", () => {
  it("accepts a minimal refund", () => {
    expect(
      validateRefundInput({
        originalTxHash: TX,
        originalDestinationChain: ORIGINAL_DEST,
        refundDestinationChain: REFUND_DEST,
        originalSenderAddress: SENDER,
        amount: "10.50",
      }),
    ).toEqual({
      originalTxHash: TX,
      originalDestinationChain: ORIGINAL_DEST,
      refundDestinationChain: REFUND_DEST,
      originalSenderAddress: SENDER,
      amount: "10.50",
      reason: undefined,
      metadata: undefined,
    });
  });

  it("trims whitespace from tx hash and sender", () => {
    const plan = validateRefundInput({
      originalTxHash: `  ${TX}  `,
      originalDestinationChain: ORIGINAL_DEST,
      refundDestinationChain: REFUND_DEST,
      originalSenderAddress: `  ${SENDER}  `,
      amount: "1.00",
    });
    expect(plan.originalTxHash).toBe(TX);
    expect(plan.originalSenderAddress).toBe(SENDER);
  });

  it("rejects an empty tx hash", () => {
    expect(() =>
      validateRefundInput({
        originalTxHash: "",
        originalDestinationChain: ORIGINAL_DEST,
        refundDestinationChain: REFUND_DEST,
        originalSenderAddress: SENDER,
        amount: "1.00",
      }),
    ).toThrow(/originalTxHash is required/);
  });

  it("rejects an empty sender address", () => {
    expect(() =>
      validateRefundInput({
        originalTxHash: TX,
        originalDestinationChain: ORIGINAL_DEST,
        refundDestinationChain: REFUND_DEST,
        originalSenderAddress: "",
        amount: "1.00",
      }),
    ).toThrow(/originalSenderAddress is required/);
  });

  it("rejects a zero amount", () => {
    expect(() =>
      validateRefundInput({
        originalTxHash: TX,
        originalDestinationChain: ORIGINAL_DEST,
        refundDestinationChain: REFUND_DEST,
        originalSenderAddress: SENDER,
        amount: "0",
      }),
    ).toThrow(ConfigError);
  });

  it("rejects merchant metadata that uses reserved __ prefix", () => {
    expect(() =>
      validateRefundInput({
        originalTxHash: TX,
        originalDestinationChain: ORIGINAL_DEST,
        refundDestinationChain: REFUND_DEST,
        originalSenderAddress: SENDER,
        amount: "1.00",
        metadata: { __sneaky: "yes" },
      }),
    ).toThrow(/reserved/);
  });

  it("rejects a reason over 256 characters", () => {
    expect(() =>
      validateRefundInput({
        originalTxHash: TX,
        originalDestinationChain: ORIGINAL_DEST,
        refundDestinationChain: REFUND_DEST,
        originalSenderAddress: SENDER,
        amount: "1.00",
        reason: "x".repeat(257),
      }),
    ).toThrow(/256 characters/);
  });

  it("accepts non-USDC merchant metadata", () => {
    expect(
      validateRefundInput({
        originalTxHash: TX,
        originalDestinationChain: ORIGINAL_DEST,
        refundDestinationChain: REFUND_DEST,
        originalSenderAddress: SENDER,
        amount: "1.00",
        metadata: { orderId: "ord_123", partial: true },
      }).metadata,
    ).toEqual({ orderId: "ord_123", partial: true });
  });
});

describe("buildRefundMetadata", () => {
  it("stamps the refund tx hash key", () => {
    const meta = buildRefundMetadata(TX, undefined, undefined);
    expect(meta[REFUND_OF_TX_KEY]).toBe(TX);
    expect(REFUND_REASON_KEY in meta).toBe(false);
  });

  it("stamps the reason when provided", () => {
    const meta = buildRefundMetadata(TX, "customer_request", undefined);
    expect(meta[REFUND_REASON_KEY]).toBe("customer_request");
  });

  it("preserves merchant metadata alongside reserved keys", () => {
    const meta = buildRefundMetadata(TX, "fraud", {
      orderId: "ord_123",
      partial: true,
    });
    expect(meta).toEqual({
      orderId: "ord_123",
      partial: true,
      [REFUND_OF_TX_KEY]: TX,
      [REFUND_REASON_KEY]: "fraud",
    });
  });

  it("merchant metadata cannot shadow the refund keys (they're stamped last)", () => {
    const meta = buildRefundMetadata(TX, "x", {
      // TypeScript blocks this, but a plain JS caller can still pass it.
      orderId: "user-set",
    } as Record<string, string>);
    expect(meta[REFUND_OF_TX_KEY]).toBe(TX);
  });
});
