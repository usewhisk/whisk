/**
 * Iris attestation client — recovery layer.
 *
 * Thin adapter over `@usewhisk/cctp`'s Iris client. Exposes a stable
 * `IrisMessage` shape (with a synthetic `"not_found"` status) so the
 * receipt view and the React `useReceipt` hook stay decoupled from the
 * underlying protocol-layer details.
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

/** Iris API base URLs, re-exported so consumers can override `baseUrl`. */
export const IRIS_MAINNET_URL = CCTP_IRIS_MAINNET_URL;
export const IRIS_SANDBOX_URL = CCTP_IRIS_SANDBOX_URL;

/**
 * Attestation lifecycle for a single burn. `"not_found"` is synthesized
 * by this client when Iris hasn't observed the burn yet — the upstream
 * API returns an empty list rather than a status string.
 */
export type IrisStatus = "pending_confirmations" | "complete" | "not_found";

export type IrisMessage = {
  status: IrisStatus;
  message?: string;
  attestation?: string;
  eventNonce?: string;
};

export type FetchAttestationOptions = {
  /** Override the Iris base URL. Defaults to the chain's network base. */
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

/** Resolve the Iris base URL for a Whisk chain. */
export function getIrisBaseUrl(chain: Chain): string {
  return cctpIrisBaseUrl(getChain(chain).network);
}

/** Single-shot attestation lookup. Returns `"not_found"` until Iris sees the burn. */
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
 * Poll Iris until the attestation reaches a terminal state or the
 * timeout elapses. Yields intermediate states via `onUpdate` so the UI
 * can render `pending_confirmations` while it waits.
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
