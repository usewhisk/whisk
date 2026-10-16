import type {
  FeeBreakdown,
  FeeEntry,
  FeeEntryKind,
  FeePolicy,
} from "../types/fee.js";
import type { Token } from "../types/token.js";
import { splitCustomFee, WHISK_TREASURY_ADDRESS } from "./treasury.js";

const USDC_DECIMALS_BIG = 10n ** 6n;

/**
 * Build the merchant fee entries from an integrator-supplied
 * {@link FeePolicy}. The total comes out to `policy.value`, split 90/10
 * between `policy.recipient` (merchant) and the Whisk treasury. The end
 * user always pays the same total — the split decides how it's
 * distributed.
 *
 * Only the absolute-amount form is supported (`policy.value`). The
 * basis-points form (`policy.bps`) is reserved for the future Swap
 * surface and is ignored here.
 */
export function buildCustomFeeEntries(
  policy: FeePolicy | undefined,
  token: Token,
): FeeEntry[] {
  if (!policy?.value || policy.value === "0") return [];
  const totalSubunits = parseSubunits(policy.value);
  if (totalSubunits <= 0n) return [];
  const { merchant, whisk } = splitCustomFee(totalSubunits);
  const entries: FeeEntry[] = [];
  if (merchant > 0n) {
    entries.push({
      kind: "custom",
      amount: formatFromSubunits(merchant),
      token,
      recipient: policy.recipient,
      description: "Merchant fee (90%)",
    });
  }
  if (whisk > 0n) {
    entries.push({
      kind: "custom",
      amount: formatFromSubunits(whisk),
      token,
      recipient: WHISK_TREASURY_ADDRESS,
      description: "Whisk platform fee (10%)",
    });
  }
  return entries;
}

/** Parse a human USDC amount string into subunits without throwing. */
function parseSubunits(input: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!match) return 0n;
  const whole = match[1] ?? "0";
  const fractionRaw = match[2] ?? "";
  const fraction = fractionRaw.slice(0, 6).padEnd(6, "0");
  return BigInt(whole) * USDC_DECIMALS_BIG + BigInt(fraction);
}

function formatFromSubunits(subunits: bigint): string {
  const whole = subunits / USDC_DECIMALS_BIG;
  const fraction = subunits % USDC_DECIMALS_BIG;
  if (fraction === 0n) return whole.toString();
  const fractionStr = fraction.toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}.${fractionStr}`;
}

/**
 * Fee kinds deducted from the bridged USDC, i.e. the ones that reduce what the
 * recipient receives. Excludes `gas` (paid in the source chain's native token)
 * and `custom` (the merchant fee, added on top of the transfer).
 */
const DEDUCTED_FROM_TRANSFER: ReadonlyArray<FeeEntryKind> = [
  "provider",
  "forwarder",
  "protocol",
];

/**
 * Total of the fees deducted from the bridged amount, in the transfer token.
 * Used to gross up the burn when `feeBearer` is `"sender"` so the recipient
 * still nets the full amount.
 */
export function sumProtocolFees(entries: FeeEntry[], token: Token): number {
  return entries
    .filter((e) => e.token === token && DEDUCTED_FROM_TRANSFER.includes(e.kind))
    .reduce((acc, e) => acc + (parseFloat(e.amount || "0") || 0), 0);
}

/**
 * Just the Forwarder fee, in the transfer token. Isolated from the other
 * deducted fees because it's gas-priced at mint time, so it's the only
 * part the `"sender"` gross-up cushions against drift.
 */
export function sumForwarderFees(entries: FeeEntry[], token: Token): number {
  return entries
    .filter((e) => e.token === token && e.kind === "forwarder")
    .reduce((acc, e) => acc + (parseFloat(e.amount || "0") || 0), 0);
}

/** Cross-token entries (e.g. gas in ETH) stay in `entries` but don't roll into `total`. */
export function sumFees(entries: FeeEntry[], token: Token): FeeBreakdown {
  const total = entries
    .filter((e) => e.token === token)
    .reduce((acc, e) => acc + parseFloat(e.amount || "0"), 0);
  return {
    total: formatAmount(total),
    token,
    entries,
  };
}

function formatAmount(n: number): string {
  // USDC precision (6 dp), trailing zeros stripped.
  const fixed = n.toFixed(6);
  return fixed.replace(/\.?0+$/, "") || "0";
}
