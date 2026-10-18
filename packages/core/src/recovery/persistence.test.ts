import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INFLIGHT_TTL_MS,
  clearInflight,
  deserializeError,
  listInflightSnapshots,
  loadInflight,
  saveInflight,
  serializeError,
} from "./persistence.js";
import { WhiskError } from "../errors/errors.js";
import type { Quote } from "../types/quote.js";

// Map-backed localStorage. Vitest runs in Node by default; we stub `window`
// ourselves so the recovery module's runtime check (`typeof window`) succeeds.
function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
}

const stubQuote = {
  amountIn: "10",
  amountOut: "10",
  token: "USDC",
} as unknown as Quote;

const baseSnapshot = {
  mode: "testnet" as const,
  walletKind: "evm" as const,
  walletAddress: "0xABC0000000000000000000000000000000000000",
  sourceChain: "Arc_Testnet",
  destinationChain: "Base_Sepolia",
  quote: stubQuote,
  steps: [{ name: "burn" as const, state: "success" as const }],
  error: serializeError(
    new WhiskError({
      code: "BRIDGE_STEP_FAILED",
      message: "burn ok, mint pending",
      retryable: true,
    }),
  ),
  raw: { protocol: "cctp", method: "burn" },
};

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: createMockStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("recovery persistence", () => {
  it("round-trips a snapshot through save → load", () => {
    expect(saveInflight(baseSnapshot)).toBe(true);
    const loaded = loadInflight(
      baseSnapshot.mode,
      baseSnapshot.walletKind,
      baseSnapshot.walletAddress,
      baseSnapshot.sourceChain,
    );
    expect(loaded).not.toBeNull();
    expect(loaded?.sourceChain).toBe("Arc_Testnet");
    expect(loaded?.destinationChain).toBe("Base_Sepolia");
    expect(loaded?.error.code).toBe("BRIDGE_STEP_FAILED");
    expect(loaded?.expiresAt).toBeGreaterThan(loaded!.savedAt);
    expect(loaded!.expiresAt - loaded!.savedAt).toBe(INFLIGHT_TTL_MS);
  });

  it("returns null when no snapshot exists for the (mode, wallet, source) tuple", () => {
    expect(loadInflight("testnet", "evm", "0xabc", "Arc_Testnet")).toBeNull();
  });

  it("round-trips merchant metadata through save → load", () => {
    const withMetadata = {
      ...baseSnapshot,
      metadata: {
        orderId: "ORD-12345",
        amount: 99.5,
        priority: true,
      },
    };
    expect(saveInflight(withMetadata)).toBe(true);
    const loaded = loadInflight(
      withMetadata.mode,
      withMetadata.walletKind,
      withMetadata.walletAddress,
      withMetadata.sourceChain,
    );
    expect(loaded?.metadata).toEqual({
      orderId: "ORD-12345",
      amount: 99.5,
      priority: true,
    });
  });

  it("loads snapshots without metadata cleanly (backward compatibility)", () => {
    // baseSnapshot has no `metadata` field — proves v1-era snapshots still load.
    expect(saveInflight(baseSnapshot)).toBe(true);
    const loaded = loadInflight(
      baseSnapshot.mode,
      baseSnapshot.walletKind,
      baseSnapshot.walletAddress,
      baseSnapshot.sourceChain,
    );
    expect(loaded?.metadata).toBeUndefined();
  });

  it("clears stale entries on load when TTL has expired", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    saveInflight(baseSnapshot);

    // Jump past the 48h TTL.
    vi.setSystemTime(new Date("2026-01-04T00:00:00Z"));
    const loaded = loadInflight(
      baseSnapshot.mode,
      baseSnapshot.walletKind,
      baseSnapshot.walletAddress,
      baseSnapshot.sourceChain,
    );
    expect(loaded).toBeNull();
  });

  it("refuses to surface a testnet snapshot when queried in mainnet mode", () => {
    saveInflight(baseSnapshot);
    const loaded = loadInflight(
      "mainnet",
      baseSnapshot.walletKind,
      baseSnapshot.walletAddress,
      baseSnapshot.sourceChain,
    );
    expect(loaded).toBeNull();
  });

  it("clearInflight removes a saved snapshot", () => {
    saveInflight(baseSnapshot);
    clearInflight(
      baseSnapshot.mode,
      baseSnapshot.walletKind,
      baseSnapshot.walletAddress,
      baseSnapshot.sourceChain,
    );
    expect(
      loadInflight(
        baseSnapshot.mode,
        baseSnapshot.walletKind,
        baseSnapshot.walletAddress,
        baseSnapshot.sourceChain,
      ),
    ).toBeNull();
  });

  it("listInflightSnapshots returns every non-expired snapshot", () => {
    saveInflight(baseSnapshot);
    saveInflight({ ...baseSnapshot, sourceChain: "Base_Sepolia" });
    const list = listInflightSnapshots();
    expect(list).toHaveLength(2);
  });

  it("saveInflight returns false in SSR (no window)", () => {
    vi.unstubAllGlobals();
    expect(saveInflight(baseSnapshot)).toBe(false);
  });

  it("serializeError / deserializeError preserves the code, name, and retryable flag", () => {
    const original = new WhiskError({
      code: "NETWORK_ERROR",
      message: "fetch failed",
      retryable: true,
      category: "failed_offchain",
    });
    original.name = "NetworkError";
    const restored = deserializeError(serializeError(original));
    expect(restored.code).toBe("NETWORK_ERROR");
    expect(restored.message).toBe("fetch failed");
    expect(restored.retryable).toBe(true);
    expect(restored.category).toBe("failed_offchain");
    expect(restored.name).toBe("NetworkError");
  });
});
