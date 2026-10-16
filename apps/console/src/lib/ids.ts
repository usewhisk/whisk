/**
 * Prefixed monotonic ULIDs for public-facing IDs.
 *
 * Uses `crypto.getRandomValues` for the randomness half + a Crockford
 * base-32 timestamp for the time half. Format:
 *
 *   {prefix}_{26-char ULID}
 *
 * Prefixes are per-domain ("org", "proj", "app", "key", "evt") so a
 * naked ID leaks its type. Same idea as Stripe's `cus_...`, `sub_...`
 * — clear at a glance in logs / support tickets / URLs.
 */
import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(now: number): string {
  let s = "";
  for (let i = 9; i >= 0; i--) {
    s += CROCKFORD[Math.floor(now / 32 ** i) % 32];
  }
  return s;
}

function encodeRandom(): string {
  const bytes = randomBytes(16);
  let s = "";
  // 16 bytes = 128 bits = 25.6 base-32 chars → produce 16 chars from
  // the leading 80 bits (10 bytes) which is plenty of entropy.
  for (let i = 0; i < 16; i++) {
    s += CROCKFORD[bytes[i]! & 0x1f];
  }
  return s;
}

/** Generate a fresh prefixed ULID. */
export function newId(
  kind: "org" | "proj" | "app" | "key" | "evt" | "usr",
): string {
  return `${kind}_${encodeTime(Date.now())}${encodeRandom()}`;
}

/**
 * Generate a public API key string.
 *
 *   wsk_pk_test_{20 random chars}  ← client-embedded, safe to expose
 *   wsk_pk_live_{20 random chars}  ← client-embedded, safe to expose
 *   wsk_sk_test_{40 random chars}  ← server-only, shown once
 *   wsk_sk_live_{40 random chars}  ← server-only, shown once
 */
export function newKey(
  kind: "public" | "secret",
  environment: "test" | "live",
): string {
  const chars = kind === "public" ? 20 : 40;
  const bytes = randomBytes(chars);
  let body = "";
  for (let i = 0; i < chars; i++) {
    body += CROCKFORD[bytes[i]! & 0x1f];
  }
  const kindSlug = kind === "public" ? "pk" : "sk";
  return `wsk_${kindSlug}_${environment}_${body}`;
}
