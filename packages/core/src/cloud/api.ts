import { ScreeningError } from "../errors/index.js";
import { DEFAULT_CLOUD_URL } from "./client.js";

/** Where the API client gets its session token. `CloudSession` is one. */
export interface TokenSource {
  token(options?: { fresh?: boolean }): Promise<string | undefined>;
}

interface Party {
  chain: string;
  address: string;
}

export interface ScreenInput {
  payer: Party;
  recipient: Party;
}

/** `unavailable` covers no session, an outage, and any answer that does not read. */
export type ScreenOutcome = "clear" | "hit" | "partial" | "unavailable";

export interface ReportInput {
  sourceChain: string;
  burnTxHash: string;
  /** The in-flight record's ID, a UUID. */
  clientTransferId: string;
  mintTxHash?: string;
}

export interface ReportedTransfer {
  id: string;
  state: string;
  recoveryUrl: string;
}

export interface CloudApi {
  screen(input: ScreenInput): Promise<ScreenOutcome>;
  /** Resolves to undefined when the burn could not be reported. Never throws. */
  report(input: ReportInput): Promise<ReportedTransfer | undefined>;
}

export interface CloudApiOptions {
  session: TokenSource;
  cloudUrl?: string;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  /** A dropped report, for a development-build warning. */
  warn?: (message: string) => void;
  screenTimeoutMs?: number;
}

const SCREEN_RESULTS = new Set(["clear", "hit", "partial"]);
// About two minutes of waiting in all, spread over seven tries.
const REPORT_BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 32_000, 64_000];
const TRANSFER_ID = /^trf_[0-9A-HJKMNP-TV-Z]{26}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    // Not JSON is the same as a wrong shape to every caller here.
    return undefined;
  }
}

function asReported(value: unknown): ReportedTransfer | undefined {
  if (
    isRecord(value) &&
    typeof value.id === "string" &&
    TRANSFER_ID.test(value.id) &&
    typeof value.state === "string" &&
    typeof value.recoveryUrl === "string" &&
    isWebUrl(value.recoveryUrl)
  ) {
    return { id: value.id, state: value.state, recoveryUrl: value.recoveryUrl };
  }
  return undefined;
}

function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function errorCode(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.error)) return undefined;
  return typeof value.error.code === "string" ? value.error.code : undefined;
}

/**
 * Calls to Whisk Cloud made with the SDK session token. Neither call ever
 * stands between a payer and a payment: the screen answers `unavailable`
 * instead of throwing, and a report retries in the background, then gives
 * up with a warning.
 */
export function createCloudApi(options: CloudApiOptions): CloudApi {
  const cloudUrl = (options.cloudUrl ?? DEFAULT_CLOUD_URL).replace(/\/+$/, "");
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const warn = options.warn ?? (() => undefined);

  const post = (
    path: string,
    token: string,
    body: unknown,
    signal?: AbortSignal,
  ) =>
    doFetch(`${cloudUrl}${path}`, {
      method: "POST",
      credentials: "omit",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      ...(signal && { signal }),
    });

  return {
    async screen(input) {
      const token = await options.session.token();
      if (!token) return "unavailable";
      let res: Response;
      try {
        res = await post(
          "/v1/screen",
          token,
          input,
          AbortSignal.timeout(options.screenTimeoutMs ?? 4_000),
        );
      } catch {
        // An outage or a timeout: the caller decides whether to fail closed.
        return "unavailable";
      }
      if (res.status !== 200) return "unavailable";
      const body = await readJson(res);
      if (
        isRecord(body) &&
        typeof body.result === "string" &&
        SCREEN_RESULTS.has(body.result)
      ) {
        return body.result as ScreenOutcome;
      }
      return "unavailable";
    },

    async report(input) {
      let token = await options.session.token();
      if (!token) return undefined;
      let refreshed = false;
      const drop = (why: string) => {
        warn(
          `Whisk Cloud: burn ${input.burnTxHash} was not reported (${why}).`,
        );
        return undefined;
      };
      for (let attempt = 0; ; attempt++) {
        let res: Response | undefined;
        try {
          res = await post("/v1/transfers", token, input);
        } catch {
          // Unreachable: retried below like a 5xx.
          res = undefined;
        }
        if (res && (res.status === 200 || res.status === 201)) {
          const reported = asReported(await readJson(res));
          return reported ?? drop("its answer did not read as a transfer");
        }
        if (res?.status === 401 && !refreshed) {
          refreshed = true;
          const fresh = await options.session.token({ fresh: true });
          if (!fresh) return drop("no verified session");
          token = fresh;
          continue;
        }
        if (res && res.status !== 429 && res.status < 500) {
          return drop(
            errorCode(await readJson(res)) ?? `status ${String(res.status)}`,
          );
        }
        const wait = REPORT_BACKOFF_MS[attempt];
        if (wait === undefined) {
          return drop(
            res ? `status ${String(res.status)}` : "Whisk Cloud is unreachable",
          );
        }
        await sleep(wait);
      }
    },
  };
}

/**
 * Throws before anything is signed when the screen matched, or when the app
 * fails closed and the screen could not be completed.
 */
export function assertScreened(
  outcome: ScreenOutcome,
  failClosed: boolean,
): void {
  if (outcome === "hit") throw new ScreeningError("hit");
  if (failClosed && outcome !== "clear") {
    throw new ScreeningError("unscreened");
  }
}
