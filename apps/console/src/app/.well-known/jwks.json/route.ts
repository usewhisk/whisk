import { NextResponse } from "next/server";
import { publicJwks } from "@/lib/jwt";

/**
 * RFC 7517 JWKS endpoint. SDKs (and any future edge worker) can
 * fetch this to verify the app JWT locally without hitting our
 * private key.
 */
export async function GET(): Promise<Response> {
  const jwks = await publicJwks();
  return NextResponse.json(jwks, {
    headers: {
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "access-control-allow-origin": "*",
    },
  });
}
