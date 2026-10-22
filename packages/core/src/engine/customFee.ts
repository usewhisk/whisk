/**
 * A {@link FeePolicy} charges the sender a USDC fee on top of the amount,
 * split 90/10 between the merchant and the Whisk treasury. Each share is
 * its own ERC-20 `transfer`, sent from the same wallet ahead of the burn or
 * transfer. The split never changes what the sender pays. The policy's
 * `bps` form is ignored here.
 */
import { encodeFunctionData, isAddress as viemIsAddress } from "viem";
import { usdcAbi, type EvmChain } from "@usewhisk/cctp";
import type { FeePolicy } from "../types/fee.js";
import { ConfigError } from "../errors/errors.js";
import { parseUsdcAmount } from "./amount.js";
import { splitCustomFee, WHISK_TREASURY_ADDRESS } from "../fees/treasury.js";
import type { EvmCall } from "./adapter.js";

export type CustomFee = {
  /** Merchant first, treasury second. */
  calls: EvmCall[];
  /** USDC subunits. */
  merchantAmount: bigint;
  /** USDC subunits. */
  whiskAmount: bigint;
  totalAmount: bigint;
  merchantRecipient: `0x${string}`;
};

/**
 * Returns `null` without a policy or when it resolves to zero. When the
 * treasury share rounds to zero, only the merchant transfer is emitted.
 */
export function buildCustomFee(
  policy: FeePolicy | undefined,
  source: EvmChain,
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
