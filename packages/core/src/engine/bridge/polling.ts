import {
  FINALITY_FAST,
  attestationSeconds,
  pollBudget,
  type BurnFeeTier,
  type CctpChain,
} from "@usewhisk/cctp";

/**
 * Poll interval and timeout for the attestation, from Circle's published
 * time for the source chain at the tier's speed. Callers may override both.
 */
export function attestationPolling(input: {
  source: CctpChain;
  tier: BurnFeeTier;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}): { intervalMs: number; timeoutMs: number } {
  const speed =
    input.tier.finalityThreshold === FINALITY_FAST ? "fast" : "standard";
  const budget = pollBudget(attestationSeconds(input.source, speed));
  return {
    intervalMs: input.pollIntervalMs ?? budget.intervalMs,
    timeoutMs: input.pollTimeoutMs ?? budget.timeoutMs,
  };
}
