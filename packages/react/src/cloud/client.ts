/**
 * Client for the Whisk Cloud API.
 *
 * Two endpoints today:
 *   POST /v1/verify  — appId → { jwt, tier, bps, environment }
 *   POST /v1/events  — logged usage, keyed to the app
 *
 * The JWT is cached in-memory for its lifetime (default 1h). A second
 * verify call inside the window is a no-op. Failures are non-fatal —
 * if Cloud is unreachable, the widget still functions; usage just
 * isn't tracked and no protocol-fee line is shown.
 */

export type VerifyResult = {
  jwt: string;
  tier: "free" | "pro" | "growth" | "enterprise";
  bps: number;
  environment: "test" | "live";
  expiresAt: number;
};

export type EventBody = {
  kind: "send" | "bridge" | "refund";
  sourceChain: string;
  destinationChain: string;
  amountUsdc?: string;
  txHash?: string;
};

const DEFAULT_BASE_URL = "https://cloud.usewhisk.xyz";

const cache = new Map<string, { verify: VerifyResult; expiresAtMs: number }>();
const inflight = new Map<string, Promise<VerifyResult | null>>();

export type CloudClient = {
  verify(): Promise<VerifyResult | null>;
  emit(event: EventBody): Promise<void>;
};

export function createCloudClient({
  appId,
  baseUrl = DEFAULT_BASE_URL,
}: {
  appId: string;
  baseUrl?: string;
}): CloudClient {
  const key = `${baseUrl}::${appId}`;

  async function verify(): Promise<VerifyResult | null> {
    const cached = cache.get(key);
    if (cached && cached.expiresAtMs > Date.now() + 60_000) {
      return cached.verify;
    }
    const existing = inflight.get(key);
    if (existing) return existing;

    const p = (async () => {
      try {
        const origin =
          typeof window !== "undefined" ? window.location.origin : undefined;
        const res = await fetch(`${baseUrl}/v1/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ appId, origin }),
        });
        if (!res.ok) {
          console.warn(
            `[whisk-cloud] verify failed (${res.status}) — widget will run without app tracking.`,
          );
          return null;
        }
        const body = (await res.json()) as VerifyResult;
        // Refresh 60s before expiry.
        cache.set(key, {
          verify: body,
          expiresAtMs: body.expiresAt * 1000,
        });
        return body;
      } catch (err) {
        console.warn(
          "[whisk-cloud] verify errored — widget will run without app tracking.",
          err,
        );
        return null;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  async function emit(event: EventBody): Promise<void> {
    const v = await verify();
    if (!v) return;
    try {
      await fetch(`${baseUrl}/v1/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${v.jwt}`,
        },
        body: JSON.stringify(event),
      });
    } catch {
      // Never surface event-emission errors to the user — this is
      // fire-and-forget telemetry, not a payment path.
    }
  }

  return { verify, emit };
}
