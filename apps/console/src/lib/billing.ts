/**
 * Billing seam.
 *
 * Phase 1 defines the interface + a noop default. When you pick a
 * web3 billing platform (Radom / HeliPay / x402 / on-chain fee
 * collector / anything else), drop a file that implements
 * `BillingProvider` and swap the default export. Nothing else in the
 * codebase changes.
 *
 * Read shape: the console already writes to `event` on every
 * completed engine call, so `getMonthlyUsage` gives you the raw
 * material. `chargeAppMonthly` runs on a cron once a month and takes
 * whatever action the chosen platform requires (post an invoice,
 * settle a channel, publish an on-chain claim, etc.).
 */
import type { Tier } from "@/db/schema";

export type UsageWindow = {
  appId: string;
  orgId: string;
  tier: Tier;
  bps: number;
  transactions: number;
  volumeUsdc: string;
  /** ISO date of the window start (inclusive). */
  from: string;
  /** ISO date of the window end (exclusive). */
  to: string;
};

export type Invoice = {
  appId: string;
  orgId: string;
  amountUsdc: string;
  status: "pending" | "settled" | "failed" | "skipped";
  externalId?: string;
  note?: string;
};

export interface BillingProvider {
  readonly name: string;
  chargeAppMonthly(usage: UsageWindow): Promise<Invoice>;
}

/**
 * Default: does nothing, returns a "skipped" invoice with the
 * calculated fee so the aggregate is visible in logs. Wire your
 * chosen platform to replace this in `providers/`.
 */
export const NoopBilling: BillingProvider = {
  name: "noop",
  async chargeAppMonthly(usage) {
    const feeUsdc = ((Number(usage.volumeUsdc) * usage.bps) / 10_000).toFixed(
      6,
    );
    return {
      appId: usage.appId,
      orgId: usage.orgId,
      amountUsdc: feeUsdc,
      status: "skipped",
      note: "No billing provider wired (Phase 1). Set WHISK_BILLING_PROVIDER + implement providers/<name>.ts to enable.",
    };
  },
};

export function resolveBillingProvider(): BillingProvider {
  // Reserved for Phase 2. Set WHISK_BILLING_PROVIDER=<name> and add
  // a file at `src/lib/billing/providers/<name>.ts` that exports a
  // default `BillingProvider`; a small dispatch will import it here.
  return NoopBilling;
}
