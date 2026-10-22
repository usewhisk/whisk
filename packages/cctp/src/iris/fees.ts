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
import type {
  BurnFeeTier,
  FinalityThreshold,
  ForwarderFeeTier,
  TransferSpeed,
} from "./types.js";
import { FINALITY_FAST, FINALITY_STANDARD } from "./types.js";
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
 * Rows for thresholds other than Fast and Standard are dropped. Use
 * `pickFeeTier` to choose one.
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
  return raw
    .map((row) => normalizeTier(row))
    .filter((t): t is BurnFeeTier => t !== null);
}

function normalizeTier(row: unknown): BurnFeeTier | null {
  if (!row || typeof row !== "object") {
    throw new IrisParseError("Iris fee tier is not an object");
  }
  const r = row as Record<string, unknown>;
  const threshold = r.finalityThreshold;
  if (threshold !== FINALITY_FAST && threshold !== FINALITY_STANDARD) {
    return null;
  }
  const out: BurnFeeTier = {
    finalityThreshold: threshold,
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

/** The row for `speed`. Throws if Iris returned none for this route. */
export function pickFeeTier(
  tiers: readonly BurnFeeTier[],
  speed: TransferSpeed,
): BurnFeeTier {
  const threshold: FinalityThreshold =
    speed === "fast" ? FINALITY_FAST : FINALITY_STANDARD;
  const tier = tiers.find((t) => t.finalityThreshold === threshold);
  if (!tier) {
    throw new ProtocolError(
      "tier_not_found",
      `Iris returned no ${speed === "fast" ? "Fast" : "Standard"} Transfer fee for this route.`,
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
