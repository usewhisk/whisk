/**
 * POST /v1/verify
 *
 * Body: { appId: "wsk_pk_...", origin?: string }
 *
 * Response 200: { ok: true, jwt, tier, bps, environment, expiresAt }
 * Response 401/403 otherwise.
 *
 * Called by the browser SDK once on `<WhiskProvider>` mount, then
 * cached in memory for ~1h. Every /v1/events post attaches the JWT.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { lookupAppByPublicKey, touchKey } from "@/lib/orgs";
import { signAppJwt } from "@/lib/jwt";
import { TIER_BPS, type Tier } from "@/db/schema";

const BodySchema = z.object({
  appId: z.string().min(10).startsWith("wsk_pk_"),
  origin: z.string().url().optional(),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return json(400, { error: "invalid_body", detail: parsed.error.flatten() });
  }

  // Prefer the SDK-supplied `origin` (it knows its own hostname); fall
  // back to the browser's Origin header (always set on CORS).
  const origin = parsed.data.origin ?? request.headers.get("origin") ?? "";

  const hit = await lookupAppByPublicKey(parsed.data.appId);
  if (!hit) return json(401, { error: "unknown_app" });
  const { app, org } = hit;

  // Live apps enforce the domain allowlist; test apps skip it so
  // localhost / preview URLs work without ceremony.
  if (app.environment === "live" && app.allowedOrigins.length > 0) {
    if (!origin || !app.allowedOrigins.includes(canonicalOrigin(origin))) {
      return json(403, {
        error: "origin_not_allowed",
        origin,
      });
    }
  }

  // Fire-and-forget usage ping.
  void touchKey(parsed.data.appId).catch(() => {});

  const tier = org.tier as Tier;
  const bps = TIER_BPS[tier];
  const ttl = 3600;
  const jwt = await signAppJwt(
    {
      appId: app.id,
      orgId: org.id,
      tier,
      bps,
      environment: app.environment,
      origin,
    },
    { ttlSeconds: ttl },
  );

  return json(
    200,
    {
      ok: true,
      jwt,
      tier,
      bps,
      environment: app.environment,
      expiresAt: Math.floor(Date.now() / 1000) + ttl,
    },
    corsHeaders(origin),
  );
}

export async function OPTIONS(request: Request): Promise<Response> {
  const origin = request.headers.get("origin") ?? "";
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

function json(
  status: number,
  data: unknown,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(data, { status, headers: extraHeaders });
}

function corsHeaders(origin: string): Record<string, string> {
  // Reflect the caller's origin so the browser accepts the response
  // with `credentials: "include"`. We're not gating CORS access here
  // — the domain allowlist above is what actually protects live apps.
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function canonicalOrigin(input: string): string {
  try {
    const u = new URL(input);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return input.toLowerCase();
  }
}
