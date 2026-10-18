import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMESTAMP_TOLERANCE_MS,
  signWebhook,
  verifyWebhook,
  WHISK_SIGNATURE_HEADER,
  WHISK_TIMESTAMP_HEADER,
  WHISK_WEBHOOK_VERSION,
} from "./sign.js";

const SECRET = "whsec_test_super_secret_value";
const NOW = 1_750_000_000_000;

describe("signWebhook", () => {
  it("returns body, signature, timestamp, and headers", async () => {
    const out = await signWebhook({ txHash: "0xabc", amount: "1.50" }, SECRET, {
      timestamp: NOW,
    });
    expect(out.timestamp).toBe(NOW);
    expect(out.body).toContain(`"version":"${WHISK_WEBHOOK_VERSION}"`);
    expect(out.body).toContain(`"timestamp":${NOW}`);
    expect(out.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(out.headers["content-type"]).toBe("application/json");
    expect(out.headers[WHISK_SIGNATURE_HEADER]).toBe(out.signature);
    expect(out.headers[WHISK_TIMESTAMP_HEADER]).toBe(String(NOW));
  });

  it("produces deterministic signatures for fixed timestamp + body", async () => {
    const a = await signWebhook({ x: 1 }, SECRET, { timestamp: NOW });
    const b = await signWebhook({ x: 1 }, SECRET, { timestamp: NOW });
    expect(a.signature).toBe(b.signature);
  });

  it("produces different signatures for different timestamps", async () => {
    const a = await signWebhook({ x: 1 }, SECRET, { timestamp: NOW });
    const b = await signWebhook({ x: 1 }, SECRET, { timestamp: NOW + 1 });
    expect(a.signature).not.toBe(b.signature);
  });

  it("rejects an empty secret", async () => {
    await expect(signWebhook({ x: 1 }, "")).rejects.toThrow(/non-empty string/);
  });
});

describe("verifyWebhook", () => {
  async function fresh(payload: unknown) {
    const out = await signWebhook(payload, SECRET, { timestamp: NOW });
    return { out, payload };
  }

  it("verifies a freshly-signed envelope", async () => {
    const { out, payload } = await fresh({ orderId: "ord_1" });
    const result = await verifyWebhook(out.body, out.headers, SECRET, {
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual(payload);
      expect(result.envelope.version).toBe(WHISK_WEBHOOK_VERSION);
      expect(result.envelope.timestamp).toBe(NOW);
    }
  });

  it("is case-insensitive on header lookup", async () => {
    const { out } = await fresh({ x: 1 });
    const mixed = {
      "X-Whisk-Signature": out.headers[WHISK_SIGNATURE_HEADER],
      "X-WHISK-TIMESTAMP": out.headers[WHISK_TIMESTAMP_HEADER],
    };
    const result = await verifyWebhook(out.body, mixed, SECRET, { now: NOW });
    expect(result.ok).toBe(true);
  });

  it("accepts header values as string[] (Node IncomingMessage shape)", async () => {
    const { out } = await fresh({ x: 1 });
    const headers = {
      [WHISK_SIGNATURE_HEADER]: [out.headers[WHISK_SIGNATURE_HEADER]!],
      [WHISK_TIMESTAMP_HEADER]: [out.headers[WHISK_TIMESTAMP_HEADER]!],
    };
    const result = await verifyWebhook(out.body, headers, SECRET, {
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a missing signature header", async () => {
    const { out } = await fresh({ x: 1 });
    const result = await verifyWebhook(
      out.body,
      { [WHISK_TIMESTAMP_HEADER]: out.headers[WHISK_TIMESTAMP_HEADER]! },
      SECRET,
      { now: NOW },
    );
    expect(result).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("rejects a missing timestamp header", async () => {
    const { out } = await fresh({ x: 1 });
    const result = await verifyWebhook(
      out.body,
      { [WHISK_SIGNATURE_HEADER]: out.headers[WHISK_SIGNATURE_HEADER]! },
      SECRET,
      { now: NOW },
    );
    expect(result).toEqual({ ok: false, reason: "missing_timestamp" });
  });

  it("rejects a non-numeric timestamp header", async () => {
    const { out } = await fresh({ x: 1 });
    const result = await verifyWebhook(
      out.body,
      {
        [WHISK_SIGNATURE_HEADER]: out.headers[WHISK_SIGNATURE_HEADER]!,
        [WHISK_TIMESTAMP_HEADER]: "not-a-number",
      },
      SECRET,
      { now: NOW },
    );
    expect(result).toEqual({ ok: false, reason: "missing_timestamp" });
  });

  it("rejects a timestamp outside the tolerance window", async () => {
    const { out } = await fresh({ x: 1 });
    const result = await verifyWebhook(out.body, out.headers, SECRET, {
      now: NOW + DEFAULT_TIMESTAMP_TOLERANCE_MS + 1,
    });
    expect(result).toEqual({ ok: false, reason: "timestamp_out_of_range" });
  });

  it("accepts a timestamp within the tolerance window", async () => {
    const { out } = await fresh({ x: 1 });
    const result = await verifyWebhook(out.body, out.headers, SECRET, {
      now: NOW + DEFAULT_TIMESTAMP_TOLERANCE_MS - 1,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects malformed JSON", async () => {
    const { out } = await fresh({ x: 1 });
    const result = await verifyWebhook("{not-json", out.headers, SECRET, {
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "malformed_body" });
  });

  it("rejects an envelope missing required fields", async () => {
    const fakeBody = JSON.stringify({ version: WHISK_WEBHOOK_VERSION });
    const headers = {
      [WHISK_SIGNATURE_HEADER]: "0".repeat(64),
      [WHISK_TIMESTAMP_HEADER]: String(NOW),
    };
    const result = await verifyWebhook(fakeBody, headers, SECRET, {
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "malformed_envelope" });
  });

  it("rejects an unsupported envelope version", async () => {
    const fakeBody = JSON.stringify({
      version: "v0",
      timestamp: NOW,
      payload: {},
    });
    const headers = {
      [WHISK_SIGNATURE_HEADER]: "0".repeat(64),
      [WHISK_TIMESTAMP_HEADER]: String(NOW),
    };
    const result = await verifyWebhook(fakeBody, headers, SECRET, {
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "unsupported_version" });
  });

  it("rejects a header timestamp that doesn't match the envelope timestamp", async () => {
    const { out } = await fresh({ x: 1 });
    // Manually substitute a different header timestamp — closes a forwarder-swap attack.
    const headers = {
      [WHISK_SIGNATURE_HEADER]: out.headers[WHISK_SIGNATURE_HEADER]!,
      [WHISK_TIMESTAMP_HEADER]: String(NOW + 1),
    };
    const result = await verifyWebhook(out.body, headers, SECRET, {
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "timestamp_out_of_range" });
  });

  it("rejects a tampered body", async () => {
    const { out } = await fresh({ x: 1 });
    const tamperedBody = out.body.replace('"x":1', '"x":2');
    const result = await verifyWebhook(tamperedBody, out.headers, SECRET, {
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a swapped signature", async () => {
    const { out } = await fresh({ x: 1 });
    const headers = {
      [WHISK_SIGNATURE_HEADER]: "0".repeat(64),
      [WHISK_TIMESTAMP_HEADER]: out.headers[WHISK_TIMESTAMP_HEADER]!,
    };
    const result = await verifyWebhook(out.body, headers, SECRET, {
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a verification with the wrong secret", async () => {
    const { out } = await fresh({ x: 1 });
    const result = await verifyWebhook(out.body, out.headers, "different", {
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects an empty secret on verify", async () => {
    await expect(verifyWebhook("{}", {}, "", { now: NOW })).rejects.toThrow(
      /non-empty string/,
    );
  });
});

describe("signWebhook ↔ verifyWebhook round-trip", () => {
  it("handles deeply nested payloads with mixed types", async () => {
    const payload = {
      orderId: "ord_xyz",
      amount: "12.50",
      items: ["a", "b", "c"],
      meta: { isRefund: true, score: 0.97 },
    };
    const out = await signWebhook(payload, SECRET, { timestamp: NOW });
    const result = await verifyWebhook(out.body, out.headers, SECRET, {
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload).toEqual(payload);
  });
});
