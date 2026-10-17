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
import { IrisAbortedError, IrisHttpError } from "../errors.js";
import type {
  GetMessagesQuery,
  IrisMessage,
  IrisMessagesResponse,
} from "./types.js";

export type GetMessagesOptions = FetchJsonOptions & {
  network: Network;
};

/**
 * Single fetch. Returns an empty array when Iris doesn't yet know
 * about the burn (Iris responds with `messages: []` in that case).
 *
 * 404 from Iris is treated the same as an empty result — both mean
 * "not yet observed."
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
    // 404 = not yet observed. Treat as "empty result" so callers don't
    // have to branch on it.
    if (err instanceof IrisHttpError && err.status === 404) {
      return [];
    }
    throw err;
  }
}

export type PollMessageOptions = GetMessagesOptions & {
  /** Polling interval in ms. Default 3000. */
  intervalMs?: number;
  /** Total timeout in ms. Default 15 minutes. */
  timeoutMs?: number;
  /**
   * Custom predicate to decide when polling is "done". Default: the
   * message exists AND either (a) forwarder was used and
   * `forwardState` is `COMPLETE`/`FAILED`, or (b) forwarder wasn't
   * used and `status` is `complete`/`failed`.
   */
  isDone?: (message: IrisMessage) => boolean;
};

const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

function defaultIsDone(message: IrisMessage): boolean {
  if (message.forwardState != null) {
    return (
      message.forwardState === "COMPLETE" || message.forwardState === "FAILED"
    );
  }
  return message.status === "complete" || message.status === "failed";
}

/**
 * Poll Iris until the message reaches a terminal state.
 *
 * Returns the latest known message on terminal state or on timeout.
 * Throws if Iris repeatedly fails (network-level), but a slow
 * attestation just times out and returns the most-recent intermediate
 * state.
 */
export async function pollMessages(
  query: GetMessagesQuery,
  options: PollMessageOptions,
): Promise<IrisMessage | null> {
  const {
    intervalMs = DEFAULT_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    isDone = defaultIsDone,
    signal,
    ...rest
  } = options;

  const deadline = Date.now() + timeoutMs;
  let latest: IrisMessage | null = null;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new IrisAbortedError("Aborted by caller");

    const messages = await getMessages(query, { ...rest, signal });
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
