/**
 * HMAC-SHA256 over the Stripe-style string `${timestamp}.${rawBody}`. Signing
 * the timestamp too stops a replay of the same body with a fresh timestamp
 * header.
 *
 * Uses Web Crypto (`globalThis.crypto.subtle`), so it runs on Node 18+, Deno,
 * Bun, Cloudflare Workers and Vercel's edge and Fluid runtimes.
 */
import { ConfigError } from "../errors/errors.js";

/** Lower-cased HTTP header that carries the hex HMAC. */
export const WHISK_SIGNATURE_HEADER = "x-whisk-signature";
/** Lower-cased HTTP header that carries the signed timestamp (ms epoch). */
export const WHISK_TIMESTAMP_HEADER = "x-whisk-timestamp";
/** Bump if the signing scheme changes. */
export const WHISK_WEBHOOK_VERSION = "v1";

/** Replay window: 5 minutes. */
export const DEFAULT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * The payload has no fixed shape, so the same helpers serve transfer
 * receipts, refund confirmations, and any custom webhook.
 */
export type WebhookEnvelope<T = unknown> = {
  version: typeof WHISK_WEBHOOK_VERSION;
  /** Unix epoch milliseconds the envelope was signed at. */
  timestamp: number;
  payload: T;
};

export type SignWebhookOptions = {
  /** Fixed timestamp, for tests. */
  timestamp?: number;
};

export type SignWebhookResult = {
  /** Serialized JSON body. POST it byte for byte. */
  body: string;
  /** Hex-encoded HMAC-SHA256 over `${timestamp}.${body}`. */
  signature: string;
  /** Timestamp embedded in both the envelope and the `x-whisk-timestamp` header. */
  timestamp: number;
  /** Headers to spread into `fetch`, `node:http` and the like. */
  headers: Record<string, string>;
};

/**
 * Returns the body, the hex signature, and `headers` with `content-type`,
 * `x-whisk-signature` and `x-whisk-timestamp` filled in.
 */
export async function signWebhook<T>(
  payload: T,
  secret: string,
  options: SignWebhookOptions = {},
): Promise<SignWebhookResult> {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new ConfigError("signWebhook: secret must be a non-empty string");
  }
  const timestamp = options.timestamp ?? Date.now();
  const envelope: WebhookEnvelope<T> = {
    version: WHISK_WEBHOOK_VERSION,
    timestamp,
    payload,
  };
  const body = JSON.stringify(envelope);
  const signature = await hmacSha256Hex(secret, `${timestamp}.${body}`);
  return {
    body,
    signature,
    timestamp,
    headers: {
      "content-type": "application/json",
      [WHISK_SIGNATURE_HEADER]: signature,
      [WHISK_TIMESTAMP_HEADER]: String(timestamp),
    },
  };
}

/** Safe to show in a UI. */
export type WebhookVerifyError =
  | "missing_signature"
  | "missing_timestamp"
  | "malformed_body"
  | "malformed_envelope"
  | "unsupported_version"
  | "timestamp_out_of_range"
  | "signature_mismatch";

export type VerifyWebhookOptions = {
  /** Allowed clock skew between sender and receiver, in ms. Default 5 min. */
  toleranceMs?: number;
  /** Fixed "now", for tests. */
  now?: number;
};

export type WebhookVerifyResult<T = unknown> =
  | { ok: true; envelope: WebhookEnvelope<T>; payload: T }
  | { ok: false; reason: WebhookVerifyError };

/**
 * - `rawBody` must be the exact bytes the sender signed: read the request
 *   body before any JSON parsing.
 * - `headers` takes the shapes Node http and Fetch return (string,
 *   string[], or undefined). Lookup is case-insensitive.
 *
 * Failures come back as `{ ok: false, reason }` rather than thrown. Throws
 * only on an empty secret.
 */
export async function verifyWebhook<T = unknown>(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  options: VerifyWebhookOptions = {},
): Promise<WebhookVerifyResult<T>> {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new ConfigError("verifyWebhook: secret must be a non-empty string");
  }

  const signature = readHeader(headers, WHISK_SIGNATURE_HEADER);
  if (!signature) return { ok: false, reason: "missing_signature" };

  const timestampHeader = readHeader(headers, WHISK_TIMESTAMP_HEADER);
  if (!timestampHeader) return { ok: false, reason: "missing_timestamp" };
  const headerTimestamp = Number(timestampHeader);
  if (!Number.isFinite(headerTimestamp)) {
    return { ok: false, reason: "missing_timestamp" };
  }

  const tolerance = options.toleranceMs ?? DEFAULT_TIMESTAMP_TOLERANCE_MS;
  const now = options.now ?? Date.now();
  if (Math.abs(now - headerTimestamp) > tolerance) {
    return { ok: false, reason: "timestamp_out_of_range" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "malformed_body" };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, reason: "malformed_envelope" };
  }
  const env = parsed as Record<string, unknown>;
  if (env.version !== WHISK_WEBHOOK_VERSION) {
    return { ok: false, reason: "unsupported_version" };
  }
  if (typeof env.timestamp !== "number" || !Number.isFinite(env.timestamp)) {
    return { ok: false, reason: "malformed_envelope" };
  }
  if (env.timestamp !== headerTimestamp) {
    // The replay window was checked against the header, so the envelope's
    // own timestamp must be the same one.
    return { ok: false, reason: "timestamp_out_of_range" };
  }
  if (!("payload" in env)) {
    return { ok: false, reason: "malformed_envelope" };
  }

  const expected = await hmacSha256Hex(secret, `${headerTimestamp}.${rawBody}`);
  if (!timingSafeHexEqual(expected, signature)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return {
    ok: true,
    envelope: parsed as WebhookEnvelope<T>,
    payload: env.payload as T,
  };
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  // Node http lower-cases incoming names; some frameworks keep the casing.
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      const v = headers[k];
      if (Array.isArray(v)) return v[0];
      return v;
    }
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new ConfigError(
      "Web Crypto (globalThis.crypto.subtle) is unavailable. " +
        "Whisk webhook helpers require Node 18+, Deno, Bun, or a modern edge runtime.",
    );
  }
  const enc = new TextEncoder();
  const key = await subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await subtle.sign("HMAC", key, enc.encode(message));
  return bytesToHex(new Uint8Array(mac));
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Constant time for equal lengths: every character is compared, so timing
 * does not reveal where the first difference falls.
 */
function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
