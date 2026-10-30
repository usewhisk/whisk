import type { AppEnvironment } from "./network.js";

export interface SessionClaims {
  env: AppEnvironment;
  configVersion: number;
  /** The remote config as signed. Parse it with `parseRemoteConfig` before use. */
  config: unknown;
  /** Milliseconds since the epoch. */
  expiresAt: number;
}

export interface VerifyOptions {
  appId: string;
  /** The Whisk Cloud origin the SDK talks to; tokens must name it as `iss`. */
  issuer: string;
  keyFor(kid: string): Promise<JsonWebKey | undefined>;
  now: number;
}

const encoder = new TextEncoder();

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(part: string): Record<string, unknown> {
  const value: unknown = JSON.parse(
    new TextDecoder().decode(fromBase64url(part)),
  );
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Session token part is not a JSON object.");
  }
  return value as Record<string, unknown>;
}

/**
 * Checks a session token from Whisk Cloud with WebCrypto, so core needs no
 * JWT library: ES256 only, signed by a key in the JWKS, for this app, from
 * this issuer, and not expired. Throws on any failure.
 */
export async function verifySessionToken(
  token: string,
  options: VerifyOptions,
): Promise<SessionClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Session token is not a JWS.");
  const [headerPart, payloadPart, signaturePart] = parts as [
    string,
    string,
    string,
  ];
  const header = decodeJson(headerPart);
  if (header.alg !== "ES256") {
    throw new Error("Session token must be signed with ES256.");
  }
  if (typeof header.kid !== "string") {
    throw new Error("Session token names no signing key.");
  }
  const jwk = await options.keyFor(header.kid);
  if (!jwk) throw new Error("Session token is signed by an unknown key.");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    fromBase64url(signaturePart),
    encoder.encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) throw new Error("Session token signature does not verify.");

  const claims = decodeJson(payloadPart);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(options.appId)) {
    throw new Error("Session token audience is another app.");
  }
  if (claims.iss !== options.issuer) {
    throw new Error("Session token issuer is not this Whisk Cloud.");
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= options.now) {
    throw new Error("Session token has expired.");
  }
  if (claims.env !== "test" && claims.env !== "live") {
    throw new Error("Session token names an unknown environment.");
  }
  if (typeof claims.cfg !== "number" || !Number.isInteger(claims.cfg)) {
    throw new Error("Session token has no config version.");
  }
  return {
    env: claims.env,
    configVersion: claims.cfg,
    config: claims.config,
    expiresAt: claims.exp * 1000,
  };
}
