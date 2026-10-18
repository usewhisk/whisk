import type { Address, CctpDomain, Network } from "../chains/types.js";
import { IrisParseError } from "../errors.js";
import { fetchIrisJson, type FetchJsonOptions } from "./fetch.js";
import { irisBaseUrl } from "./urls.js";

export type UpfrontFeeType = "FORWARD" | "PRE_FINALITY";

export type SignedBurnQuoteRequest = {
  /** The burn amount in USDC subunits. The quote is bound to it. */
  amount: bigint;
  /** The source chain's USDC: Whisk pays fees in USDC, never native gas. */
  feeToken: Address;
  requests: readonly UpfrontFeeType[];
};

export type SignedQuoteExpiry =
  | { mode: "TIMESTAMP"; expiresAt: number }
  | { mode: "BLOCK_NUMBER"; expiresAtBlock: bigint };

export type SignedBurnQuote = {
  /** Submitted as-is to `TokenMessengerWithFees`. */
  signedQuote: `0x${string}`;
  /** Circle's clock, in Unix seconds. */
  issuedAt: number;
  expiry: SignedQuoteExpiry;
  feeTotalAmount: bigint;
  feeToken: Address;
  /**
   * Absent from Circle's schema but present in its replies. When it is
   * missing, the contract alone holds the quote to the amount.
   */
  burnAmount?: bigint;
  items: { type: UpfrontFeeType; amount: bigint }[];
};

/**
 * `POST /v2/quote/burn/usdc/{source}/{destination}`: Circle's signed price
 * for paying the Fast and forwarding fees on the source chain. No API key.
 */
export async function getSignedBurnQuote(
  network: Network,
  sourceDomain: CctpDomain,
  destinationDomain: CctpDomain,
  request: SignedBurnQuoteRequest,
  options: FetchJsonOptions = {},
): Promise<SignedBurnQuote> {
  const url = `${irisBaseUrl(network)}/v2/quote/burn/usdc/${sourceDomain}/${destinationDomain}`;
  const raw = await fetchIrisJson<unknown>(url, options, {
    method: "POST",
    body: {
      amount: request.amount.toString(),
      feeToken: request.feeToken,
      requests: request.requests.map((type) => ({ type })),
    },
  });
  const quote = parseQuote(raw);
  if (quote.burnAmount !== undefined && quote.burnAmount !== request.amount) {
    throw new IrisParseError(
      `Iris quoted ${quote.burnAmount} subunits, not the ${request.amount} requested`,
    );
  }
  if (quote.feeToken.toLowerCase() !== request.feeToken.toLowerCase()) {
    throw new IrisParseError(
      `Iris priced the fee in ${quote.feeToken}, not ${request.feeToken}`,
    );
  }
  const types = quote.items.map((i) => i.type).sort();
  if (types.join() !== [...request.requests].sort().join()) {
    throw new IrisParseError(
      `Iris priced ${types.join(", ")}, not ${request.requests.join(", ")}`,
    );
  }
  return quote;
}

function parseQuote(raw: unknown): SignedBurnQuote {
  const fail = (what: string): never => {
    throw new IrisParseError(`Iris quote: ${what}`);
  };
  if (typeof raw !== "object" || raw === null) return fail("not an object");
  const r = raw as Record<string, unknown>;

  const signedQuote = r.signedQuote;
  if (
    typeof signedQuote !== "string" ||
    !/^0x([0-9a-fA-F]{2})+$/.test(signedQuote)
  ) {
    return fail("signedQuote is not hex bytes");
  }
  if (!Number.isSafeInteger(r.issuedAt))
    return fail("issuedAt is not a timestamp");
  const feeToken = r.feeToken;
  if (typeof feeToken !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(feeToken)) {
    return fail("feeToken is not an address");
  }
  const feeTotalAmount = subunits(r.feeTotalAmount) ?? fail("feeTotalAmount");
  const burnAmount =
    r.burnAmount === undefined
      ? undefined
      : (subunits(r.burnAmount) ?? fail("burnAmount"));

  if (!Array.isArray(r.items) || r.items.length === 0) return fail("no items");
  const items = r.items.map(
    (item: unknown): SignedBurnQuote["items"][number] => {
      const i = (item ?? {}) as Record<string, unknown>;
      if (i.type !== "FORWARD" && i.type !== "PRE_FINALITY") {
        return fail(`unknown item type ${String(i.type)}`);
      }
      return {
        type: i.type,
        amount: subunits(i.amount) ?? fail("item amount"),
      };
    },
  );
  if (items.reduce((sum, i) => sum + i.amount, 0n) !== feeTotalAmount) {
    return fail("items do not add up to feeTotalAmount");
  }

  return {
    signedQuote: signedQuote as `0x${string}`,
    issuedAt: r.issuedAt as number,
    expiry: parseExpiry(r.expiry) ?? fail("expiry"),
    feeTotalAmount,
    feeToken: feeToken as Address,
    ...(burnAmount !== undefined && { burnAmount }),
    items,
  };
}

function parseExpiry(raw: unknown): SignedQuoteExpiry | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const e = raw as Record<string, unknown>;
  if (e.mode === "TIMESTAMP" && Number.isSafeInteger(e.expiresAt)) {
    return { mode: "TIMESTAMP", expiresAt: e.expiresAt as number };
  }
  if (e.mode === "BLOCK_NUMBER" && Number.isSafeInteger(e.expiresAtBlock)) {
    return {
      mode: "BLOCK_NUMBER",
      expiresAtBlock: BigInt(e.expiresAtBlock as number),
    };
  }
  return undefined;
}

function subunits(raw: unknown): bigint | undefined {
  return typeof raw === "string" && /^(0|[1-9]\d*)$/.test(raw)
    ? BigInt(raw)
    : undefined;
}

/**
 * Circle's remaining Fast Transfer allowance, in USDC subunits rounded down.
 * Iris sends it as a JSON number of whole USDC.
 */
export async function getFastBurnAllowance(
  network: Network,
  options: FetchJsonOptions = {},
): Promise<bigint> {
  const raw = await fetchIrisJson<unknown>(
    `${irisBaseUrl(network)}/v2/fastBurn/USDC/allowance`,
    options,
  );
  const value =
    typeof raw === "object" && raw !== null && "allowance" in raw
      ? raw.allowance
      : undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new IrisParseError("Iris allowance is not a non-negative number");
  }
  // The shortest decimal form of a double reads back as the same double,
  // so this is the text Iris sent for any allowance below 2^53.
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match)
    throw new IrisParseError(`Iris allowance ${value} is not decimal`);
  const frac = (match[2] ?? "").padEnd(6, "0").slice(0, 6);
  return BigInt(match[1]!) * 1_000_000n + BigInt(frac);
}
