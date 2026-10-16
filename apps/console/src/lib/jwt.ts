/**
 * ES256 JWT signing for the appId → capability handshake.
 *
 * The SDK sends `{ appId, origin }` to /v1/verify. If the app is
 * valid + the origin is on the allowlist, we mint a short-lived JWT
 * with `{ appId, tier, bps, allowedChains, environment }`. The SDK
 * caches it for 1h and attaches it to /v1/events posts.
 *
 * Key material lives in `WHISK_JWT_PRIVATE_KEY_JWK` /
 * `_PUBLIC_KEY_JWK` env vars (JSON Web Key format). Rotate by
 * publishing both old + new public keys at /.well-known/jwks.json
 * during the transition window, then removing the old one.
 *
 * If the env vars are missing we generate an ephemeral key at boot
 * so dev works out of the box. NEVER rely on that in production — a
 * server restart invalidates every cached JWT.
 */
import {
  SignJWT,
  jwtVerify,
  importJWK,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type KeyLike,
} from "jose";

const ISSUER = "https://cloud.usewhisk.xyz";
const ALG = "ES256";

type KeyBundle = {
  privateKey: KeyLike | Uint8Array;
  publicKeyJwk: Record<string, unknown>;
  kid: string;
};

let cache: KeyBundle | null = null;

async function keys(): Promise<KeyBundle> {
  if (cache) return cache;
  const privJwk = process.env["WHISK_JWT_PRIVATE_KEY_JWK"];
  const pubJwk = process.env["WHISK_JWT_PUBLIC_KEY_JWK"];
  if (privJwk && pubJwk) {
    const privateKey = await importJWK(JSON.parse(privJwk), ALG);
    const publicKeyJwk = JSON.parse(pubJwk) as Record<string, unknown>;
    cache = {
      privateKey,
      publicKeyJwk,
      kid: (publicKeyJwk["kid"] as string | undefined) ?? "wsk-prod",
    };
    return cache;
  }
  // Dev fallback — ephemeral key pair, warned about at boot.
  console.warn(
    "[jwt] WHISK_JWT_PRIVATE_KEY_JWK not set — generating ephemeral key. Every restart invalidates issued JWTs. Do NOT run this in production.",
  );
  const { privateKey, publicKey } = await generateKeyPair(ALG, {
    extractable: true,
  });
  const publicKeyJwk = (await exportJWK(publicKey)) as unknown as Record<
    string,
    unknown
  >;
  publicKeyJwk["kid"] = "wsk-dev";
  publicKeyJwk["use"] = "sig";
  publicKeyJwk["alg"] = ALG;
  cache = {
    privateKey,
    publicKeyJwk,
    kid: publicKeyJwk["kid"] as string,
  };
  return cache;
}

export type WhiskAppClaims = {
  /** Whisk app id (proj_..., not the public key). */
  appId: string;
  /** Whisk org id — one org owns N apps. */
  orgId: string;
  /** Free / pro / growth / enterprise at time of issuance. */
  tier: "free" | "pro" | "growth" | "enterprise";
  /** Take-rate in basis points. Display-only in Phase 1. */
  bps: number;
  /** Environment the app was created in. */
  environment: "test" | "live";
  /** Origin that requested the JWT (audit trail). */
  origin: string;
};

export async function signAppJwt(
  claims: WhiskAppClaims,
  { ttlSeconds = 3600 }: { ttlSeconds?: number } = {},
): Promise<string> {
  const { privateKey, kid } = await keys();
  return new SignJWT(claims as unknown as JWTPayload)
    .setProtectedHeader({ alg: ALG, kid })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .setIssuer(ISSUER)
    .setSubject(claims.appId)
    .sign(privateKey);
}

export async function verifyAppJwt(token: string): Promise<WhiskAppClaims> {
  const { publicKeyJwk } = await keys();
  const publicKey = await importJWK(publicKeyJwk as never, ALG);
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ISSUER,
  });
  return payload as unknown as WhiskAppClaims;
}

export async function publicJwks(): Promise<{ keys: unknown[] }> {
  const { publicKeyJwk } = await keys();
  return { keys: [publicKeyJwk] };
}
