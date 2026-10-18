import { IrisRateLimitedError } from "../errors.js";

export type IrisLimiterOptions = {
  /** Circle's limit is 35 a second; staying under it leaves room for others. */
  ratePerSecond?: number;
  /** Circle blocks the IP for five minutes after a 429. */
  standDownMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type IrisLimiter = {
  /** Waits for a request slot, or throws while the host is standing down. */
  acquire(host: string): Promise<void>;
  /** Records a 429 and returns when requests may resume. */
  standDown(host: string): number;
  now(): number;
  sleep(ms: number): Promise<void>;
};

type Bucket = { tokens: number; updatedAt: number; blockedUntil: number };

export function createIrisLimiter(
  options: IrisLimiterOptions = {},
): IrisLimiter {
  const rate = options.ratePerSecond ?? 30;
  const standDownMs = options.standDownMs ?? 5 * 60_000;
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const buckets = new Map<string, Bucket>();

  const bucket = (host: string): Bucket => {
    let b = buckets.get(host);
    if (!b) {
      b = { tokens: rate, updatedAt: now(), blockedUntil: 0 };
      buckets.set(host, b);
    }
    return b;
  };

  return {
    async acquire(host) {
      const b = bucket(host);
      if (now() < b.blockedUntil) {
        throw new IrisRateLimitedError(host, b.blockedUntil);
      }
      const elapsed = (now() - b.updatedAt) / 1000;
      b.tokens = Math.min(rate, b.tokens + elapsed * rate);
      b.updatedAt = now();
      if (b.tokens < 1) {
        const waitMs = Math.ceil(((1 - b.tokens) / rate) * 1000);
        await sleep(waitMs);
        b.tokens += (waitMs / 1000) * rate;
        b.updatedAt = now();
      }
      b.tokens -= 1;
    },
    standDown(host) {
      const b = bucket(host);
      b.blockedUntil = now() + standDownMs;
      return b.blockedUntil;
    },
    now,
    sleep,
  };
}

/** Shared by every Iris call in the process, as Circle's limit is per IP. */
export const defaultIrisLimiter = createIrisLimiter();
