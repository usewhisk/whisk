import { isChainId } from "@usewhisk/cctp";
import type { InflightRecord, InflightStore } from "./types.js";

/** Lives as long as the engine; pass a persistent store to survive a reload. */
export function createMemoryInflightStore(): InflightStore {
  const records = new Map<string, InflightRecord>();
  return {
    async put(record) {
      records.set(record.id, { ...record });
    },
    async list() {
      return [...records.values()].map((r) => ({ ...r }));
    },
    async remove(id) {
      records.delete(id);
    },
  };
}

/** The part of the Web Storage API the store uses, so tests can fake it. */
export type InflightStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

const PREFIX = "whisk:inflight:";

/**
 * Keeps each record as JSON under `whisk:inflight:<id>`, for example in
 * `localStorage`. Entries under the prefix that are not version 2 records,
 * such as snapshots from earlier releases, are left alone and not listed.
 */
export function createStorageInflightStore(
  storage: InflightStorage,
): InflightStore {
  return {
    async put(record) {
      storage.setItem(PREFIX + record.id, JSON.stringify(record));
    },
    async list() {
      const records: InflightRecord[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        const record = parseRecord(storage.getItem(key));
        if (record && PREFIX + record.id === key) records.push(record);
      }
      return records.sort((a, b) => a.createdAt - b.createdAt);
    },
    async remove(id) {
      storage.removeItem(PREFIX + id);
    },
  };
}

const STEPS = new Set(["signing", "burned", "attested", "minted"]);

function parseRecord(raw: string | null): InflightRecord | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // Not a record of ours: other code may write under the same prefix.
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  const strings = ["id", "amountBurned", "recipient"] as const;
  const ok =
    r.version === 2 &&
    strings.every((k) => typeof r[k] === "string") &&
    (r.network === "mainnet" || r.network === "testnet") &&
    typeof r.sourceChain === "string" &&
    isChainId(r.sourceChain) &&
    typeof r.destinationChain === "string" &&
    isChainId(r.destinationChain) &&
    (r.mint === "forwarder" || r.mint === "adapter") &&
    (r.speed === "fast" || r.speed === "standard") &&
    typeof r.step === "string" &&
    STEPS.has(r.step) &&
    (r.sourceTxHash === undefined || typeof r.sourceTxHash === "string") &&
    (r.mintTxHash === undefined || typeof r.mintTxHash === "string") &&
    Number.isFinite(r.createdAt) &&
    Number.isFinite(r.updatedAt);
  return ok ? (value as InflightRecord) : null;
}
