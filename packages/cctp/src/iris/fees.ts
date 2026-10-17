/**
 * Iris burn fees endpoint.
 *
 * GET /v2/burn/USDC/fees/{src}/{dst}?forward=true
 *
 * Returns one row per finality threshold (1000 = Fast, 2000 = Standard).
 * Each row has the protocol fee in basis points and, with ?forward=true,
 * the forwarder fee levels low/med/high in USDC subunits.
 */
import type { CctpDomain, Network } from "../chains/types.js";
import { irisBaseUrl } from "./urls.js";
import { fetchIrisJson, type FetchJsonOptions } from "./fetch.js";
import type { BurnFeeTier, ForwarderFeeTier } from "./types.js";
import { FINALITY_FAST } from "./types.js";
import { IrisParseError, ProtocolError } from "../errors.js";
import {
  parseFeeBps,
  parseForwarderFee,
  selectForwarderFee,
} from "../fees/math.js";

export type GetBurnFeesOptions = FetchJsonOptions & {
  /** Default `true`. Set to `false` if you only need protocol fees. */
  includeForwarderFee?: boolean;
};

/**
 * Fetch the fee tiers for a (src, dst) domain pair.
 *
 * Returns the raw tier array exactly as Iris returns it. Use
 * `pickFeeTier` to project to a specific finality + forwarder choice.
 */
export async function getBurnFees(
  network: Network,
  sourceDomain: CctpDomain,
  destinationDomain: CctpDomain,
  options: GetBurnFeesOptions = {},
): Promise<BurnFeeTier[]> {
  const { includeForwarderFee = true, ...fetchOpts } = options;
  const base = irisBaseUrl(network);
  const url = new URL(
    `${base}/v2/burn/USDC/fees/${sourceDomain}/${destinationDomain}`,
  );
  if (includeForwarderFee) url.searchParams.set("forward", "true");

  const raw = await fetchIrisJson<unknown>(url.toString(), fetchOpts);
  if (!Array.isArray(raw)) {
    throw new IrisParseError("Iris burn-fees response is not an array");
  }
  // Iris returns both Fast (1000) and Standard (2000) tiers. Whisk
  // only supports Fast, so filter Standard out here — callers never
  // see it. Routes where Iris doesn't return a Fast tier surface as
  // an empty array; `pickFeeTier` then throws cleanly.
  return raw
    .map((row) => normalizeTier(row))
    .filter((t): t is BurnFeeTier => t !== null);
}

function normalizeTier(row: unknown): BurnFeeTier | null {
  if (!row || typeof row !== "object") {
    throw new IrisParseError("Iris fee tier is not an object");
  }
  const r = row as Record<string, unknown>;
  if (r.finalityThreshold !== FINALITY_FAST) return null;
  const out: BurnFeeTier = {
    finalityThreshold: FINALITY_FAST,
    minimumFee: parseFeeBps(r.minimumFee),
  };
  if (r.forwardFee && typeof r.forwardFee === "object") {
    const ff = r.forwardFee as Record<string, unknown>;
    out.forwardFee = {
      low: parseForwarderFee(ff.low),
      med: parseForwarderFee(ff.med),
      high: parseForwarderFee(ff.high),
    };
  }
  return out;
}

/**
 * Pick the Fast tier from the Iris response. Throws if the route
 * doesn't support Fast Transfer (the chain pair is bridge-blocked
 * under Whisk's Fast-only policy).
 */
export function pickFeeTier(tiers: readonly BurnFeeTier[]): BurnFeeTier {
  const tier = tiers[0];
  if (!tier) {
    throw new ProtocolError(
      "tier_not_found",
      "No Fast Transfer fee tier returned by Iris for this route. Whisk does not bridge over Standard Transfer.",
    );
  }
  return tier;
}

/** The forwarder fee for a level, in USDC subunits. */
export function pickForwarderFee(
  tier: BurnFeeTier,
  level: keyof ForwarderFeeTier = "med",
): bigint {
  return selectForwarderFee(tier, level);
}
