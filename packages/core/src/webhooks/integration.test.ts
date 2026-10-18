/**
 * End-to-end webhook + receipt + metadata integration.
 *
 * Locks the contract between the engine's `SendResult.metadata` flow,
 * the HMAC-SHA256 signing layer, and the receipt projection. A merchant
 * server signs a `SendResult` envelope; the merchant's own webhook
 * receiver verifies it; the UI re-renders the same lifecycle from the
 * stored source-tx hash.
 */
import { describe, expect, it } from "vitest";
import { Base } from "@usewhisk/cctp";
import type { EvmAdapter } from "../engine/adapter.js";
import {
  signWebhook,
  verifyWebhook,
  WHISK_SIGNATURE_HEADER,
  WHISK_TIMESTAMP_HEADER,
} from "./sign.js";
import { deriveReceiptView } from "../recovery/receipt.js";

import { createWhisk } from "../engine/createWhisk.js";

const SECRET = "whsk_test_secret_a1b2c3d4e5f6";
const SUCCESS_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const SENDER = "0x0000000000000000000000000000000000000010" as `0x${string}`;
const RECIPIENT = "0x0000000000000000000000000000000000000020";

function makeAdapter(): EvmAdapter {
  return {
    kind: "evm",
    address: SENDER,
    async getChainId() {
      return Base.evmChainId;
    },
    async switchChain() {},
    async sendCalls() {
      return { hashes: [SUCCESS_HASH] };
    },
    async waitForReceipt() {
      return { status: "success", blockNumber: 1n };
    },
  };
}

describe("webhook + receipt + metadata pipeline", () => {
  it("signs a SendResult envelope, verifies it, and re-derives the receipt", async () => {
    // 1. Engine runs a same-chain Send and stamps metadata on the result.
    const engine = createWhisk({
      chains: ["Base"],
      defaultMetadata: { app: "checkout-demo" },
    });
    const adapter = makeAdapter();
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Base",
      recipient: { address: RECIPIENT, chain: "Base" },
      amount: "10",
      adapter,
    });
    const result = await engine.send({
      adapter,
      quote,
      metadata: { orderId: "ord_42" },
    });
    expect(result.kind).toBe("success");
    expect(result.metadata).toMatchObject({
      app: "checkout-demo",
      orderId: "ord_42",
    });

    // 2. Merchant server signs a webhook envelope with the result.
    const signed = await signWebhook(result, SECRET, {
      timestamp: 1_700_000_000_000,
    });
    expect(signed.headers[WHISK_SIGNATURE_HEADER]).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.headers[WHISK_TIMESTAMP_HEADER]).toBe("1700000000000");

    // 3. Receiving webhook verifies the signature + replay window.
    const verified = await verifyWebhook<typeof result>(
      signed.body,
      signed.headers,
      SECRET,
      { now: 1_700_000_001_000 },
    );
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      // The envelope payload survives the JSON round-trip. The engine
      // result on the success path is already JSON-safe (no bigints).
      expect(verified.payload.kind).toBe("success");
      expect(verified.payload.metadata?.orderId).toBe("ord_42");
      expect(verified.payload.metadata?.app).toBe("checkout-demo");
    }

    // 4. UI re-renders the receipt from just the source-tx hash.
    if (result.kind === "success" && result.finalTxHash) {
      const view = deriveReceiptView({
        sourceChain: "Base",
        sourceTxHash: result.finalTxHash,
        destinationChain: "Base",
      });
      expect(view.stage).toBe("settled");
      expect(view.isCrossChain).toBe(false);
      expect(view.steps[0]?.name).toBe("transfer");
      expect(view.steps[0]?.state).toBe("success");
    }
  });

  it("rejects a tampered envelope body", async () => {
    const engine = createWhisk({ chains: ["Base"] });
    const adapter = makeAdapter();
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Base",
      recipient: { address: RECIPIENT, chain: "Base" },
      amount: "1",
      adapter,
    });
    const result = await engine.send({ adapter, quote });
    const signed = await signWebhook(result, SECRET);
    const tampered = signed.body.replace(
      '"kind":"success"',
      '"kind":"failure"',
    );
    const verified = await verifyWebhook(tampered, signed.headers, SECRET);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("signature_mismatch");
    }
  });

  it("rejects a stale timestamp outside the replay window", async () => {
    const signed = await signWebhook({ hello: "world" }, SECRET, {
      timestamp: 1_700_000_000_000,
    });
    const verified = await verifyWebhook(signed.body, signed.headers, SECRET, {
      // 10 minutes after signing — outside the default 5-min tolerance.
      now: 1_700_000_000_000 + 10 * 60 * 1000,
    });
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("timestamp_out_of_range");
    }
  });
});
