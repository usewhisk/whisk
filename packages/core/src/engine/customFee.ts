/**
 * Custom merchant fee — on-chain encoding.
 *
 * An integrator-supplied {@link FeePolicy} pays a USDC fee on top of
 * the transferred amount. The total is split 90/10 between
 * `policy.recipient` (the merchant) and the Whisk treasury. The engine
 * encodes each share as its own ERC-20 `transfer` call and prepends
 * them to the source-chain call list — same wallet, same chain, same
 * token as the burn (bridges) or transfer (same-chain).
 *
 * The end user always pays the configured total; the split only
 * decides how that total is distributed.
 *
 * The `bps` form is reserved for the future Swap surface and is
 * ignored for v1.
 */
import { encodeFunctionData, isAddress as viemIsAddress } from "viem";
import { usdcAbi, type EvmCctpChain } from "@usewhisk/cctp";
import type { FeePolicy } from "../types/fee.js";
import { ConfigError } from "../errors/errors.js";
import { parseUsdcAmount } from "./amount.js";
import { splitCustomFee, WHISK_TREASURY_ADDRESS } from "../fees/treasury.js";
import type { EvmCall } from "./adapter.js";

export type CustomFee = {
  /** Source-chain `transfer` calls in submission order: merchant first, treasury second. */
  calls: EvmCall[];
  /** USDC subunits paid to `policy.recipient`. */
  merchantAmount: bigint;
  /** USDC subunits paid to {@link WHISK_TREASURY_ADDRESS}. */
  whiskAmount: bigint;
  /** Total sender debit (merchantAmount + whiskAmount). */
  totalAmount: bigint;
  /** Resolved merchant recipient address. */
  merchantRecipient: `0x${string}`;
};

/**
 * Build the on-chain merchant-fee transfers for a source chain.
 * Returns `null` when no policy is set or when the policy resolves to
 * zero. When the 10% share rounds to zero (micro-fee amounts), only
 * the merchant transfer is emitted.
 */
export function buildCustomFee(
  policy: FeePolicy | undefined,
  source: EvmCctpChain,
): CustomFee | null {
  if (!policy?.value) return null;

  let total: bigint;
  try {
    total = parseUsdcAmount(policy.value);
  } catch {
    return null;
  }
  if (total <= 0n) return null;

  if (!viemIsAddress(policy.recipient)) {
    throw new ConfigError(
      `customFee: recipient "${policy.recipient}" is not a valid EVM address.`,
    );
  }

  const { merchant, whisk } = splitCustomFee(total);
  const calls: EvmCall[] = [];

  if (merchant > 0n) {
    calls.push({
      to: source.usdc,
      data: encodeFunctionData({
        abi: usdcAbi,
        functionName: "transfer",
        args: [policy.recipient as `0x${string}`, merchant],
      }),
      value: 0n,
    });
  }
  if (whisk > 0n) {
    calls.push({
      to: source.usdc,
      data: encodeFunctionData({
        abi: usdcAbi,
        functionName: "transfer",
        args: [WHISK_TREASURY_ADDRESS, whisk],
      }),
      value: 0n,
    });
  }

  return {
    calls,
    merchantAmount: merchant,
    whiskAmount: whisk,
    totalAmount: total,
    merchantRecipient: policy.recipient as `0x${string}`,
  };
}
