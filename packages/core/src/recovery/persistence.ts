/**
 * Mid-flight recovery snapshot persistence.
 *
 * RUNTIME: every function in this module is **browser-only**. They read
 * and write `window.localStorage` so a customer who reloads or crashes
 * mid-bridge can pick the flow back up where it left off.
 *
 * On the server, in a Worker, or anywhere `window` is undefined, the
 * read functions return `null` / `[]` and the write functions return
 * `false` without throwing. Node and Vue consumers can ignore this
 * surface — CCTP recovery is a page-refresh concern, not a server one.
 *
 * If you need server-side persistence (e.g. a fulfilment service that
 * tracks long-running bridges), build it against the engine's
 * `onStep` listener and your own datastore; the snapshot shape here
 * isn't a recommended on-the-wire format.
 */
import type { Quote } from "../types/quote.js";
import type { Step } from "../types/step.js";
import type { WhiskErrorCategory, WhiskErrorCode } from "../errors/errors.js";
import { WhiskError } from "../errors/errors.js";
import type { StepName } from "../types/step.js";
import type { ChainNetwork } from "../types/chain.js";
import type { WhiskMetadata } from "../metadata/types.js";

export type WalletKind = "evm" | "solana";

export const INFLIGHT_TTL_MS = 48 * 60 * 60 * 1000;
export const STORAGE_PREFIX = "whisk:inflight:";

const SNAPSHOT_VERSION = 1;

type SerializedError = {
  name: string;
  message: string;
  code: WhiskErrorCode;
  retryable: boolean;
  category?: WhiskErrorCategory;
  step?: StepName;
};

export type InflightSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  mode: ChainNetwork;
  walletKind: WalletKind;
  walletAddress: string;
  sourceChain: string;
  destinationChain: string;
  quote: Quote;
  steps: Step[];
  error: SerializedError;
  raw: unknown;
  savedAt: number;
  expiresAt: number;
  /**
   * Merged metadata captured at send time. Survives the recovery cycle so a
   * resumed transfer keeps merchant order/ref correlation. Optional for
   * backward compatibility with v1 snapshots written before this field shipped.
   */
  metadata?: WhiskMetadata;
};

function storageKey(
  mode: ChainNetwork,
  walletKind: WalletKind,
  address: string,
  sourceChain: string,
): string {
  return `${STORAGE_PREFIX}${mode}:${walletKind}:${address.toLowerCase()}:${sourceChain}`;
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    // Probe-write detects Safari private mode, which returns a no-op
    // localStorage instead of throwing on the .setItem call.
    const probe = "__whisk_probe__";
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function serializeError(err: WhiskError): SerializedError {
  return {
    name: err.name,
    message: err.message,
    code: err.code,
    retryable: err.retryable,
    category: err.category,
    step: err.step,
  };
}

export function deserializeError(s: SerializedError): WhiskError {
  const err = new WhiskError({
    code: s.code,
    message: s.message,
    retryable: s.retryable,
    category: s.category,
    step: s.step,
  });
  err.name = s.name;
  return err;
}

/**
 * Persist a mid-flight failure snapshot.
 *
 * Browser-only. Returns `false` on SSR / Node / Worker (no `window`),
 * when localStorage is unavailable (Safari private mode), or on any
 * storage exception (quota exceeded, blocked by user settings).
 */
export function saveInflight(
  input: Omit<InflightSnapshot, "version" | "savedAt" | "expiresAt">,
): boolean {
  const storage = getStorage();
  if (!storage) return false;

  const now = Date.now();
  const snapshot: InflightSnapshot = {
    version: SNAPSHOT_VERSION,
    ...input,
    savedAt: now,
    expiresAt: now + INFLIGHT_TTL_MS,
  };

  try {
    const serialized = JSON.stringify(snapshot);
    storage.setItem(
      storageKey(
        input.mode,
        input.walletKind,
        input.walletAddress,
        input.sourceChain,
      ),
      serialized,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a snapshot for the given (mode, wallet, source). Auto-clears
 * stale entries.
 *
 * Browser-only. Returns `null` on SSR / Node / Worker, when localStorage
 * is unavailable, when no snapshot exists, or when the stored payload
 * is from an older schema version.
 */
export function loadInflight(
  mode: ChainNetwork,
  walletKind: WalletKind,
  address: string,
  sourceChain: string,
): InflightSnapshot | null {
  const storage = getStorage();
  if (!storage) return null;

  const key = storageKey(mode, walletKind, address, sourceChain);
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    const snapshot = JSON.parse(raw) as Partial<InflightSnapshot>;
    if (snapshot.version !== SNAPSHOT_VERSION) {
      storage.removeItem(key);
      return null;
    }
    if (
      typeof snapshot.expiresAt !== "number" ||
      Date.now() > snapshot.expiresAt
    ) {
      storage.removeItem(key);
      return null;
    }
    if (snapshot.mode !== mode) {
      return null;
    }
    if (
      snapshot.raw === undefined ||
      !Array.isArray(snapshot.steps) ||
      !snapshot.quote ||
      !snapshot.error
    ) {
      storage.removeItem(key);
      return null;
    }
    return snapshot as InflightSnapshot;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

/**
 * Remove the snapshot for a given (mode, wallet, source) — typically
 * called once the bridge resolves successfully via retry.
 *
 * Browser-only. No-op on SSR / Node / Worker.
 */
export function clearInflight(
  mode: ChainNetwork,
  walletKind: WalletKind,
  address: string,
  sourceChain: string,
): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey(mode, walletKind, address, sourceChain));
  } catch {
    /* ignore */
  }
}

/**
 * Every non-expired snapshot in storage. Clears stale entries as a
 * side effect.
 *
 * Browser-only. Returns `[]` on SSR / Node / Worker.
 */
export function listInflightSnapshots(): InflightSnapshot[] {
  const storage = getStorage();
  if (!storage) return [];

  const out: InflightSnapshot[] = [];
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const snapshot = JSON.parse(raw) as Partial<InflightSnapshot>;
      if (snapshot.version !== SNAPSHOT_VERSION) {
        stale.push(key);
        continue;
      }
      if (
        typeof snapshot.expiresAt !== "number" ||
        Date.now() > snapshot.expiresAt
      ) {
        stale.push(key);
        continue;
      }
      out.push(snapshot as InflightSnapshot);
    } catch {
      stale.push(key);
    }
  }
  for (const key of stale) {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  return out;
}
