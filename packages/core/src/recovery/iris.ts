/**
 * Wraps the `@usewhisk/cctp` Iris client in a smaller `IrisMessage` shape,
 * with a `"not_found"` status for a burn Iris has not seen yet.
 */
import {
  getChain,
  getMessages,
  irisBaseUrl as cctpIrisBaseUrl,
  IRIS_MAINNET_URL as CCTP_IRIS_MAINNET_URL,
  IRIS_SANDBOX_URL as CCTP_IRIS_SANDBOX_URL,
  type IrisMessage as CctpIrisMessage,
} from "@usewhisk/cctp";
import type { Chain } from "../types/chain.js";

/** Re-exported so callers can pass one as `baseUrl`. */
export const IRIS_MAINNET_URL = CCTP_IRIS_MAINNET_URL;
export const IRIS_SANDBOX_URL = CCTP_IRIS_SANDBOX_URL;

/**
 * Iris returns an empty list, not a status, for a burn it has not seen yet;
 * that becomes `"not_found"`.
 */
export type IrisStatus = "pending_confirmations" | "complete" | "not_found";

export type IrisMessage = {
  status: IrisStatus;
  message?: string;
  attestation?: string;
  eventNonce?: string;
};

export type FetchAttestationOptions = {
  /** Defaults to the Iris URL for the source chain's network. */
  baseUrl?: string;
  signal?: AbortSignal;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
};

export type PollAttestationOptions = FetchAttestationOptions & {
  /** Total polling deadline in ms. Default 10 minutes. */
  timeout?: number;
  /** Interval between polls in ms. Default 3 s. */
  pollingInterval?: number;
  onUpdate?: (msg: IrisMessage) => void;
};

export function getIrisBaseUrl(chain: Chain): string {
  return cctpIrisBaseUrl(getChain(chain).network);
}

/** One lookup. Returns `"not_found"` until Iris sees the burn. */
export async function fetchAttestationOnce(
  sourceChain: Chain,
  burnTxHash: string,
  options: FetchAttestationOptions = {},
): Promise<IrisMessage> {
  const source = getChain(sourceChain);
  const fetchOpts: Parameters<typeof getMessages>[1] = {
    network: source.network,
    ...(options.signal && { signal: options.signal }),
    ...(options.baseUrl && { baseUrl: options.baseUrl }),
    ...(options.fetch && { fetch: options.fetch }),
  };
  const messages = await getMessages(
    { sourceDomain: source.cctpDomain, transactionHash: burnTxHash },
    fetchOpts,
  );
  const first = messages[0];
  if (!first) return { status: "not_found" };
  return toIrisMessage(first);
}

/**
 * Polls until the attestation is `complete` or the timeout passes, then
 * returns the latest status. Every response also goes to `onUpdate`.
 */
export async function pollAttestation(
  sourceChain: Chain,
  burnTxHash: string,
  options: PollAttestationOptions = {},
): Promise<IrisMessage> {
  const timeout = options.timeout ?? 10 * 60 * 1000;
  const interval = options.pollingInterval ?? 3000;
  const deadline = Date.now() + timeout;

  let latest = await fetchAttestationOnce(sourceChain, burnTxHash, options);
  options.onUpdate?.(latest);
  if (latest.status === "complete") return latest;

  while (Date.now() < deadline) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    await sleep(interval, options.signal);
    latest = await fetchAttestationOnce(sourceChain, burnTxHash, options);
    options.onUpdate?.(latest);
    if (latest.status === "complete") return latest;
  }
  return latest;
}

function toIrisMessage(raw: CctpIrisMessage): IrisMessage {
  // Iris sends only these two; anything else has not finished attesting.
  const out: IrisMessage = {
    status: raw.status === "complete" ? "complete" : "pending_confirmations",
  };
  if (raw.message) out.message = raw.message;
  if (raw.attestation) out.attestation = raw.attestation;
  if (raw.eventNonce) out.eventNonce = raw.eventNonce;
  return out;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort);
  });
}
