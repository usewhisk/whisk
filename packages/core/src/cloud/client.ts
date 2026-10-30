import {
  parseRemoteConfig,
  type ParsedRemoteConfig,
  type RemoteConfig,
} from "./config.js";
import type { AppEnvironment } from "./network.js";
import { verifySessionToken } from "./token.js";

export const DEFAULT_CLOUD_URL = "https://api.usewhisk.xyz";

/** Where the last verified config is kept between page loads. */
export interface CloudStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function createMemoryCloudStorage(): CloudStorage {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
  };
}

export type CloudState =
  | {
      /** `cloud` from this handshake; `stored` from an earlier one, while it is unexpired. */
      source: "cloud" | "stored";
      env: AppEnvironment;
      configVersion: number;
      config: RemoteConfig;
      expiresAt: number;
      ignored: string[];
    }
  | {
      source: "local";
      reason: "not-yet" | "unreachable" | "refused" | "invalid-token";
      detail?: string;
    };

export interface CloudSessionOptions {
  appId: string;
  sdkVersion: string;
  cloudUrl?: string;
  fetch?: typeof globalThis.fetch;
  storage?: CloudStorage;
  now?: () => number;
}

export interface CloudSession {
  /** The config in force right now. Never waits on the network. */
  state(): CloudState;
  /**
   * Runs a handshake and returns the new state. It never throws: when Whisk
   * Cloud is unreachable or answers with something that does not verify, the
   * SDK keeps paying on its last verified config, or on local config alone.
   */
  refresh(): Promise<CloudState>;
}

interface Stored {
  appId: string;
  env: AppEnvironment;
  configVersion: number;
  config: unknown;
  expiresAt: number;
}

const JWKS_REFETCH_MS = 60_000;

/**
 * The SDK side of the Whisk Cloud handshake (ADR Decision 6). A token is
 * trusted only after its ES256 signature verifies against the JWKS; what it
 * says is then narrowed against local config by `narrowConfig`.
 *
 * Stored state holds verified claims, not the token: anything that can write
 * this page's storage can already change the page itself, so re-verifying a
 * stored token would add no protection.
 */
export function createCloudSession(options: CloudSessionOptions): CloudSession {
  const cloudUrl = (options.cloudUrl ?? DEFAULT_CLOUD_URL).replace(/\/+$/, "");
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const storage = options.storage ?? createMemoryCloudStorage();
  const now = options.now ?? Date.now;
  const storageKey = `whisk:cloud:${options.appId}`;

  const keys = new Map<string, JsonWebKey>();
  let jwksFetchedAt = -Infinity;
  let jwksInFlight: Promise<void> | undefined;

  async function fetchJwks(): Promise<void> {
    const res = await doFetch(`${cloudUrl}/.well-known/jwks.json`, {
      credentials: "omit",
    });
    if (!res.ok) throw new Error(`JWKS answered ${String(res.status)}.`);
    const body = (await res.json()) as { keys?: unknown };
    if (!Array.isArray(body.keys)) throw new Error("JWKS has no keys.");
    for (const key of body.keys as (JsonWebKey & { kid?: unknown })[]) {
      if (typeof key.kid === "string") keys.set(key.kid, key);
    }
    jwksFetchedAt = now();
  }

  async function keyFor(kid: string): Promise<JsonWebKey | undefined> {
    const known = keys.get(kid);
    if (known) return known;
    if (now() - jwksFetchedAt < JWKS_REFETCH_MS) return undefined;
    jwksInFlight ??= fetchJwks().finally(() => {
      jwksInFlight = undefined;
    });
    await jwksInFlight;
    return keys.get(kid);
  }

  function fromStored(): CloudState | undefined {
    const raw = storage.get(storageKey);
    if (raw === null) return undefined;
    let stored: Partial<Stored>;
    try {
      stored = JSON.parse(raw) as Partial<Stored>;
    } catch {
      // Unreadable storage is the same as no storage.
      return undefined;
    }
    if (
      stored.appId !== options.appId ||
      (stored.env !== "test" && stored.env !== "live") ||
      typeof stored.expiresAt !== "number" ||
      typeof stored.configVersion !== "number" ||
      stored.expiresAt <= now()
    ) {
      return undefined;
    }
    const parsed = parseRemoteConfig(stored.config);
    if (!parsed) return undefined;
    return toState(
      "stored",
      stored.env,
      stored.configVersion,
      stored.expiresAt,
      parsed,
    );
  }

  let current: CloudState = fromStored() ?? {
    source: "local",
    reason: "not-yet",
  };

  function fallback(
    reason: "unreachable" | "refused" | "invalid-token",
    detail: string,
  ): CloudState {
    return fromStored() ?? { source: "local", reason, detail };
  }

  async function handshake(): Promise<CloudState> {
    let res: Response;
    try {
      res = await doFetch(`${cloudUrl}/v1/sessions`, {
        method: "POST",
        credentials: "omit",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appId: options.appId,
          sdkVersion: options.sdkVersion,
        }),
      });
    } catch (error) {
      return fallback("unreachable", String(error));
    }
    if (!res.ok)
      return fallback("refused", `Whisk Cloud answered ${String(res.status)}.`);

    let claims: Awaited<ReturnType<typeof verifySessionToken>>;
    try {
      const body = (await res.json()) as { token?: unknown };
      if (typeof body.token !== "string")
        throw new Error("No token in the answer.");
      claims = await verifySessionToken(body.token, {
        appId: options.appId,
        issuer: cloudUrl,
        keyFor,
        now: now(),
      });
    } catch (error) {
      return fallback(
        "invalid-token",
        error instanceof Error ? error.message : String(error),
      );
    }
    const parsed = parseRemoteConfig(claims.config);
    if (!parsed) return fallback("invalid-token", "Unsupported config schema.");

    const stored: Stored = {
      appId: options.appId,
      env: claims.env,
      configVersion: claims.configVersion,
      config: claims.config,
      expiresAt: claims.expiresAt,
    };
    storage.set(storageKey, JSON.stringify(stored));
    return toState(
      "cloud",
      claims.env,
      claims.configVersion,
      claims.expiresAt,
      parsed,
    );
  }

  return {
    state: () => current,
    async refresh() {
      current = await handshake();
      return current;
    },
  };
}

function toState(
  source: "cloud" | "stored",
  env: AppEnvironment,
  configVersion: number,
  expiresAt: number,
  parsed: ParsedRemoteConfig,
): CloudState {
  return {
    source,
    env,
    configVersion,
    config: parsed.config,
    expiresAt,
    ignored: parsed.ignored,
  };
}
