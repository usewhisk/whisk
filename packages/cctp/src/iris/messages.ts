/**
 * Iris messages endpoint.
 *
 * GET /v2/messages/{srcDomain}?transactionHash=...
 * GET /v2/messages/{srcDomain}?nonce=...
 *
 * Returns the message + attestation + forwarder state in a single
 * call. Use this to drive recovery polling.
 */
import type { CctpDomain, Network } from "../chains/types.js";
import { irisBaseUrl } from "./urls.js";
import { fetchIrisJson, type FetchJsonOptions } from "./fetch.js";
import {
  IrisAbortedError,
  IrisHttpError,
  IrisRateLimitedError,
} from "../errors.js";
import type { SecondsRange } from "../chains/attestation.js";
import { defaultIrisLimiter } from "./limiter.js";
import type {
  GetMessagesQuery,
  IrisMessage,
  IrisMessagesResponse,
} from "./types.js";

export type GetMessagesOptions = FetchJsonOptions & {
  network: Network;
};

/**
 * Single fetch. Returns an empty array when Iris doesn't yet know about
 * the burn, whether it answers `messages: []` or 404.
 */
export async function getMessages(
  query: GetMessagesQuery,
  options: GetMessagesOptions,
): Promise<IrisMessage[]> {
  const { network, ...fetchOpts } = options;
  const url = new URL(
    `${irisBaseUrl(network)}/v2/messages/${query.sourceDomain}`,
  );
  if (query.transactionHash) {
    url.searchParams.set("transactionHash", query.transactionHash);
  }
  if (query.nonce) {
    url.searchParams.set("nonce", query.nonce);
  }
  try {
    const json = await fetchIrisJson<IrisMessagesResponse>(
      url.toString(),
      fetchOpts,
    );
    return json.messages ?? [];
  } catch (err) {
    if (err instanceof IrisHttpError && err.status === 404) {
      return [];
    }
    throw err;
  }
}

export type PollMessageOptions = GetMessagesOptions & {
  /** Polling interval in ms. Default 3000, or from {@link pollBudget}. */
  intervalMs?: number;
  /** Total timeout in ms. Default 15 minutes, or from {@link pollBudget}. */
  timeoutMs?: number;
  /**
   * Custom predicate to decide when polling is "done". Default: a forwarded
   * message once Circle's relayer is done or has failed, otherwise once the
   * attestation is complete.
   */
  isDone?: (message: IrisMessage) => boolean;
  /**
   * Called when a 429 makes the poll stand down, with the time it resumes.
   * The wait does not count against `timeoutMs`.
   */
  onRateLimited?: (retryAt: number) => void;
};

const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const TIMEOUT_MARGIN_MS = 5 * 60 * 1000;

/**
 * How often and how long to poll for a route whose attestation takes
 * `eta` seconds. Fast routes poll often so the payer hears at once; hour-long
 * ones poll gently so they do not eat the shared rate limit.
 */
export function pollBudget(eta: SecondsRange): {
  intervalMs: number;
  timeoutMs: number;
} {
  const intervalMs =
    eta.max <= 60 ? 2_000 : eta.max <= 30 * 60 ? 10_000 : 30_000;
  return { intervalMs, timeoutMs: eta.max * 2 * 1000 + TIMEOUT_MARGIN_MS };
}

/**
 * Circle's relayer has minted once it reports the mint `CONFIRMED` or
 * `COMPLETE` with its tx hash. `PENDING` can carry a hash that is not mined.
 */
export function isForwardDone(message: IrisMessage): boolean {
  return (
    (message.forwardState === "CONFIRMED" ||
      message.forwardState === "COMPLETE") &&
    !!message.forwardTxHash
  );
}

function defaultIsDone(message: IrisMessage): boolean {
  if (message.forwardState != null) {
    return isForwardDone(message) || message.forwardState === "FAILED";
  }
  return message.status === "complete";
}

/**
 * Returns the message once `isDone` holds, or on timeout the latest one
 * seen (`null` if none). Throws if Iris keeps failing; a slow attestation
 * only times out.
 */
export async function pollMessages(
  query: GetMessagesQuery,
  options: PollMessageOptions,
): Promise<IrisMessage | null> {
  const {
    intervalMs = DEFAULT_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    isDone = defaultIsDone,
    onRateLimited,
    signal,
    ...rest
  } = options;
  const limiter = rest.limiter ?? defaultIrisLimiter;

  let deadline = limiter.now() + timeoutMs;
  let latest: IrisMessage | null = null;

  while (limiter.now() < deadline) {
    if (signal?.aborted) throw new IrisAbortedError("Aborted by caller");

    let messages: IrisMessage[];
    try {
      messages = await getMessages(query, { ...rest, signal });
    } catch (err) {
      if (!(err instanceof IrisRateLimitedError)) throw err;
      onRateLimited?.(err.retryAt);
      const waitMs = Math.max(0, err.retryAt - limiter.now());
      deadline += waitMs;
      await limiter.sleep(waitMs);
      continue;
    }
    if (messages.length > 0) {
      const first = messages[0];
      if (first) {
        latest = first;
        if (isDone(first)) return first;
      }
    }

    await sleep(intervalMs, signal);
  }

  return latest;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new IrisAbortedError("Aborted by caller"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new IrisAbortedError("Aborted by caller"));
    }
    signal?.addEventListener("abort", onAbort);
  });
}
