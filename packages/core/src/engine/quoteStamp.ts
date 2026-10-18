import type { Quote } from "../types/quote.js";

/** Long enough to read the form, short enough that Iris fees rarely move. */
export const QUOTE_TTL_MS = 60_000;

export function stampQuote(): Pick<Quote, "id" | "issuedAt" | "expiresAt"> {
  const issuedAt = Date.now();
  return {
    id: globalThis.crypto.randomUUID(),
    issuedAt,
    expiresAt: issuedAt + QUOTE_TTL_MS,
  };
}
