/**
 * POST /v1/events
 *
 * Body: { kind, sourceChain, destinationChain, amountUsdc?, txHash? }
 * Auth: `Authorization: Bearer <jwt>` — the JWT minted by /v1/verify.
 *
 * Write-once event record. The billing layer aggregates monthly and
 * charges via whichever web3 platform is wired in Phase 2.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db/client";
import { newId } from "@/lib/ids";
import { verifyAppJwt } from "@/lib/jwt";

const BodySchema = z.object({
  kind: z.enum(["send", "bridge", "refund"]),
  sourceChain: z.string().min(1),
  destinationChain: z.string().min(1),
  amountUsdc: z.string().optional(),
  txHash: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) {
    return json(401, { error: "missing_jwt" });
  }
  let claims;
  try {
    claims = await verifyAppJwt(token);
  } catch {
    return json(401, { error: "invalid_jwt" });
  }

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
  const b = parsed.data;

  await db.insert(schema.event).values({
    id: newId("evt"),
    appId: claims.appId,
    kind: b.kind,
    sourceChain: b.sourceChain,
    destinationChain: b.destinationChain,
    ...(b.amountUsdc ? { amountUsdc: b.amountUsdc } : {}),
    ...(b.txHash ? { txHash: b.txHash } : {}),
    tierAtEvent: claims.tier,
    bpsAtEvent: claims.bps,
  });

  return json(202, { ok: true }, corsHeaders(claims.origin));
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
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
