/**
 * Iris reattest endpoint.
 *
 * POST /v2/reattest/{nonce}
 *
 * Asks Circle to sign an expired or pre-finality message again. Circle only
 * acknowledges the request; the new attestation is then read from
 * `/v2/messages` by nonce.
 */
import type { Network } from "../chains/types.js";
import { irisBaseUrl } from "./urls.js";
import { fetchIrisJson, type FetchJsonOptions } from "./fetch.js";
import { IrisHttpError, IrisParseError } from "../errors.js";

export type ReattestOptions = FetchJsonOptions & {
  network: Network;
};

/** Returns Circle's acknowledgement, or `null` when Iris has no such nonce. */
export async function reattest(
  nonce: string,
  options: ReattestOptions,
): Promise<{ nonce: string } | null> {
  const { network, ...fetchOpts } = options;
  const url = `${irisBaseUrl(network)}/v2/reattest/${nonce}`;
  let json: unknown;
  try {
    json = await fetchIrisJson<unknown>(url, fetchOpts, {
      method: "POST",
      body: {},
    });
  } catch (err) {
    if (err instanceof IrisHttpError && err.status === 404) return null;
    throw err;
  }
  const acknowledged =
    typeof json === "object" && json !== null && "nonce" in json
      ? json.nonce
      : undefined;
  if (typeof acknowledged !== "string") {
    throw new IrisParseError("Iris reattest reply has no nonce");
  }
  return { nonce: acknowledged };
}
