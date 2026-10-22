import type { CctpChain, CctpDomain } from "./types.js";
import type { TransferSpeed } from "../iris/types.js";
import { ProtocolError } from "../errors.js";

export type SecondsRange = { min: number; max: number };

type DomainTimes = { fast?: SecondsRange; standard: SecondsRange };

const s = (min: number, max = min): SecondsRange => ({ min, max });
const L1_FINALITY = s(900, 1140);

// Circle's average attestation times, from
// https://developers.circle.com/cctp/concepts/finality-and-block-confirmations
// Circle publishes mainnet figures only; testnets share the domain and use them.
const BY_DOMAIN: Record<CctpDomain, DomainTimes> = {
  0: { fast: s(20), standard: L1_FINALITY },
  1: { standard: s(8) },
  2: { fast: s(8), standard: L1_FINALITY },
  3: { fast: s(8), standard: L1_FINALITY },
  5: { fast: s(8), standard: s(25) },
  6: { fast: s(8), standard: L1_FINALITY },
  7: { standard: s(8) },
  10: { fast: s(8), standard: L1_FINALITY },
  11: { fast: s(8), standard: s(21_600, 115_200) },
  12: { fast: s(8), standard: L1_FINALITY },
  13: { standard: s(8) },
  14: { fast: s(8), standard: L1_FINALITY },
  15: { standard: s(5) },
  16: { standard: s(5) },
  18: { standard: s(10) },
  19: { standard: s(5) },
  21: { fast: s(8), standard: s(1800) },
  22: { fast: s(8), standard: L1_FINALITY },
  25: { fast: s(20), standard: s(7200, 14_400) },
  26: { standard: s(0.5) },
  27: { standard: s(5) },
  28: { fast: s(8), standard: s(960, 1260) },
  29: { standard: s(0.65) },
  30: { fast: s(8), standard: s(1200, 1800) },
  31: { standard: s(7) },
  32: { standard: s(0.5) },
  33: { standard: s(1) },
  37: { fast: s(8), standard: L1_FINALITY },
};

/** How long Circle takes to attest a burn from `chain`. The mint comes after. */
export function attestationSeconds(
  chain: CctpChain,
  speed: TransferSpeed,
): SecondsRange {
  const times = BY_DOMAIN[chain.cctpDomain]?.[speed];
  if (!times) {
    throw new ProtocolError(
      "no_route",
      `No ${speed} attestation time for ${chain.label}.`,
    );
  }
  return times;
}
