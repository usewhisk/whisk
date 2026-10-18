/**
 * Iris reattest endpoint.
 *
 * POST /v2/reattest/{nonce}
 *
 * Used when a message's attestation has expired and needs to be
 * re-signed by Circle (e.g. before the destination chain processed the
 * mint). Returns the new attestation.
 */
import type { Network } from "../chains/types.js";
import { irisBaseUrl } from "./urls.js";
import { fetchIrisJson, type FetchJsonOptions } from "./fetch.js";
import { IrisHttpError } from "../errors.js";
import type { IrisMessage } from "./types.js";

export type ReattestOptions = FetchJsonOptions & {
  network: Network;
};

/**
 * Triggers re-attestation for a message. The response shape is the
 * same as `getMessages` (Iris returns the re-attested message).
 */
export async function reattest(
  nonce: string,
  options: ReattestOptions,
): Promise<IrisMessage | null> {
  const { network, ...fetchOpts } = options;
  const url = `${irisBaseUrl(network)}/v2/reattest/${nonce}`;
  try {
    const json = await fetchIrisJson<{ messages?: IrisMessage[] }>(url, {
      ...fetchOpts,
    });
    return json.messages?.[0] ?? null;
  } catch (err) {
    if (err instanceof IrisHttpError && err.status === 404) {
      return null;
    }
    throw err;
  }
}
