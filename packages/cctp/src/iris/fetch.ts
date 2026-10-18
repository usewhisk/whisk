/**
 * Iris fetch wrapper with timeout, retry, and `AbortSignal`.
 *
 * Error mapping:
 *   - 4xx (except 429)        → IrisHttpError (no retry)
 *   - 5xx / 429               → retry, then IrisHttpError
 *   - Network failure         → retry, then IrisNetworkError
 *   - Caller-signaled abort   → IrisAbortedError
 *   - Per-request timeout     → IrisAbortedError after retries
 *   - JSON parse failure      → IrisParseError (no retry)
 */

import {
  IrisAbortedError,
  IrisHttpError,
  IrisNetworkError,
  IrisParseError,
  IrisRateLimitedError,
} from "../errors.js";
import { defaultIrisLimiter, type IrisLimiter } from "./limiter.js";

export type FetchJsonOptions = {
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Total retry budget. Default 3. */
  maxRetries?: number;
  /** Base delay between retries in ms. Backoff multiplies by retry index. */
  baseDelayMs?: number;
  /** Allow caller-side cancellation. */
  signal?: AbortSignal;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Defaults to one limiter shared by every Iris call in the process. */
  limiter?: IrisLimiter;
};

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 300;

export async function fetchIrisJson<T>(
  url: string,
  options: FetchJsonOptions = {},
  request: { method: "POST"; body: unknown } | { method: "GET" } = {
    method: "GET",
  },
): Promise<T> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    signal,
    fetch: fetchImpl = fetch,
    limiter = defaultIrisLimiter,
  } = options;
  const host = new URL(url).host;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new IrisAbortedError("Aborted by caller");
    await limiter.acquire(host);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onCallerAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onCallerAbort);

    try {
      const res = await fetchImpl(url, {
        method: request.method,
        headers: {
          accept: "application/json",
          ...(request.method === "POST" && {
            "content-type": "application/json",
          }),
        },
        ...(request.method === "POST" && {
          body: JSON.stringify(request.body),
        }),
        signal: ctrl.signal,
      });

      if (res.ok) {
        let json: unknown;
        try {
          json = await res.json();
        } catch (err) {
          throw new IrisParseError(`Invalid JSON from ${url}`, err);
        }
        return json as T;
      }

      // A retry inside the block would extend it, so stop asking at once.
      if (res.status === 429) {
        throw new IrisRateLimitedError(host, limiter.standDown(host));
      }

      // 4xx (excluding 429) → don't retry; surface immediately.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new IrisHttpError(res.status, url, await safeText(res));
      }

      // 5xx → record + retry.
      lastError = new IrisHttpError(res.status, url, await safeText(res));
    } catch (err) {
      // Parse errors and 4xx HTTP errors bypass the retry loop.
      if (err instanceof IrisParseError) throw err;
      if (err instanceof IrisRateLimitedError) throw err;
      if (err instanceof IrisHttpError) {
        if (err.status < 500 && err.status !== 429) throw err;
      }
      // Disambiguate "caller aborted" from "per-request timeout fired."
      if (signal?.aborted) throw new IrisAbortedError("Aborted by caller");
      lastError = err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onCallerAbort);
    }

    if (attempt < maxRetries) {
      await sleep(baseDelayMs * (attempt + 1), signal);
    }
  }

  if (lastError instanceof IrisHttpError) throw lastError;
  throw new IrisNetworkError(
    `Iris request failed after ${maxRetries + 1} attempts`,
    lastError,
  );
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
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
