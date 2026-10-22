import type {
  FeeBreakdown,
  FeeEntry,
  FeeEntryKind,
  FeePolicy,
} from "../types/fee.js";
import type { Token } from "../types/token.js";
import { ConfigError } from "../errors/errors.js";
import { splitCustomFee, WHISK_TREASURY_ADDRESS } from "./treasury.js";

const USDC_DECIMALS_BIG = 10n ** 6n;

/**
 * Merchant fee entries for a {@link FeePolicy}: `policy.value` split 90/10
 * between `policy.recipient` and the Whisk treasury. The payer pays the same
 * total either way. `policy.bps` is not supported and is ignored.
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
 * Total of the fees deducted from the bridged amount, in subunits of the
 * transfer token. Used to gross up the burn when `feeBearer` is `"sender"`
 * so the recipient still nets the full amount.
 */
export function sumProtocolFees(entries: FeeEntry[], token: Token): bigint {
  return sumSubunits(
    entries.filter(
      (e) => e.token === token && DEDUCTED_FROM_TRANSFER.includes(e.kind),
    ),
  );
}

/**
 * The Forwarder fee alone, in subunits of the transfer token. It is priced
 * from destination gas at mint time, so it is the part that can drift after
 * the quote.
 */
export function sumForwarderFees(entries: FeeEntry[], token: Token): bigint {
  return sumSubunits(
    entries.filter((e) => e.token === token && e.kind === "forwarder"),
  );
}

/** Cross-token entries (e.g. gas in ETH) stay in `entries` but don't roll into `total`. */
export function sumFees(entries: FeeEntry[], token: Token): FeeBreakdown {
  return {
    total: formatFromSubunits(
      sumSubunits(entries.filter((e) => e.token === token)),
    ),
    token,
    entries,
  };
}

function sumSubunits(entries: FeeEntry[]): bigint {
  return entries.reduce((acc, e) => acc + entrySubunits(e.amount), 0n);
}

// Entry amounts come from formatFromSubunits, so anything else is a bug
// upstream and must not be summed as zero.
function entrySubunits(amount: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(amount);
  if (!match) {
    throw new ConfigError(`Fee entry amount "${amount}" is not a USDC amount.`);
  }
  const fraction = (match[2] ?? "").padEnd(6, "0");
  return BigInt(match[1] ?? "0") * USDC_DECIMALS_BIG + BigInt(fraction);
}
