/**
 * Iris burn fees endpoint.
 *
 * GET /v2/burn/USDC/fees/{src}/{dst}?forward=true
 *
 * Returns one row per finality threshold (1000 = Fast, 2000 = Standard).
 * Each row has the protocol fee bps × 100 and (when ?forward=true) the
 * forwarder fee tiers low/med/high in USDC subunits.
 */
import type { CctpDomain, CctpNetwork } from "../chains/types.js";
import { irisBaseUrl } from "./urls.js";
import { fetchIrisJson, type FetchJsonOptions } from "./fetch.js";
import type { BurnFeeTier, ForwarderFeeTier } from "./types.js";
import { FINALITY_FAST } from "./types.js";
import { IrisParseError, ProtocolError } from "../errors.js";

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
  network: CctpNetwork,
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
  const threshold = Number(r.finalityThreshold);
  if (threshold !== FINALITY_FAST) return null;
  const minimumFee = Number(r.minimumFee);
  if (!Number.isFinite(minimumFee) || minimumFee < 0) {
    throw new IrisParseError(
      `Iris minimumFee is invalid: ${String(r.minimumFee)}`,
    );
  }
  const out: BurnFeeTier = {
    finalityThreshold: FINALITY_FAST,
    minimumFee,
  };
  if (r.forwardFee && typeof r.forwardFee === "object") {
    const ff = r.forwardFee as Record<string, unknown>;
    out.forwardFee = {
      low: Number(ff.low),
      med: Number(ff.med),
      high: Number(ff.high),
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

/**
 * Pick the forwarder fee level from a tier. Falls back to `med` when
 * the requested level isn't present.
 */
export function pickForwarderFee(
  tier: BurnFeeTier,
  level: keyof ForwarderFeeTier = "med",
): bigint {
  if (!tier.forwardFee) {
    throw new ProtocolError(
      "fee_unavailable",
      "Tier has no forwardFee — fetch with includeForwarderFee=true",
    );
  }
  const value = tier.forwardFee[level];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new IrisParseError(`Invalid forwardFee.${level}: ${String(value)}`);
  }
  return BigInt(Math.ceil(value));
}
