/**
 * A {@link FeePolicy} charges the sender a USDC fee on top of the amount,
 * split 90/10 between the merchant and the Whisk treasury. Each share is
 * its own ERC-20 `transfer` from the same wallet, sent with the burn or
 * transfer in one atomic batch, or after it has landed. Never before, so a
 * transfer that fails costs the payer no fee. The split never changes what
 * the sender pays. The policy's `bps` form is ignored here.
 */
import { encodeFunctionData, isAddress as viemIsAddress } from "viem";
import { usdcAbi, type EvmChain } from "@usewhisk/cctp";
import type { FeePolicy } from "../types/fee.js";
import { ConfigError, toWhiskError, WhiskError } from "../errors/errors.js";
import { formatUsdcAmount, parseUsdcAmount } from "./amount.js";
import { splitCustomFee, WHISK_TREASURY_ADDRESS } from "../fees/treasury.js";
import type { EvmAdapter, EvmCall } from "./adapter.js";
import type { CustomFeeOutcome } from "./types.js";

type Hex = `0x${string}`;

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

/** A {@link CustomFee} on its way to being paid for one transfer. */
export type FeeCharge = {
  readonly calls: EvmCall[];
  outcome(): CustomFeeOutcome;
  /** @internal */
  submit(
    adapter: EvmAdapter,
    chainId: number,
    calls: EvmCall[],
    onLastSubmitted?: (hash: Hex) => void,
  ): Promise<Hex[]>;
  /** @internal */
  settle(adapter: EvmAdapter): Promise<void>;
};

export function createFeeCharge(
  fee: CustomFee,
  onSettled?: (outcome: CustomFeeOutcome) => void,
): FeeCharge {
  const amount = formatUsdcAmount(fee.totalAmount);
  let outcome: CustomFeeOutcome = { status: "unpaid", amount };
  let batched: Hex[] | null = null;

  const settled = (next: CustomFeeOutcome) => {
    outcome = next;
    onSettled?.(next);
  };

  return {
    calls: fee.calls,
    outcome: () => outcome,

    async submit(adapter, chainId, calls, onLastSubmitted) {
      if (await adapter.supportsAtomicBatch?.(chainId)) {
        let reported = false;
        try {
          const { hashes } = await adapter.sendCalls([...calls, ...fee.calls], {
            atomic: true,
            // A batch that shares one hash reports it for its last call,
            // which is a fee call here.
            onSubmitted: (hash, index) => {
              if (reported || index < calls.length - 1) return;
              reported = true;
              onLastSubmitted?.(hash);
            },
          });
          if (hashes.length === calls.length + fee.calls.length) {
            batched = hashes.slice(calls.length);
            return hashes.slice(0, calls.length);
          }
          batched = hashes.slice(-1);
          return hashes.slice(-1);
        } catch (cause) {
          if (
            !(cause instanceof WhiskError) ||
            cause.category !== "atomic_unsupported"
          ) {
            throw cause;
          }
        }
      }
      const { hashes } = await adapter.sendCalls(calls, {
        onSubmitted: (hash, index) => {
          if (index === calls.length - 1) onLastSubmitted?.(hash);
        },
      });
      return hashes;
    },

    async settle(adapter) {
      if (batched) {
        // All or nothing, and the burn or transfer landed, so the fee did.
        settled({ status: "paid", txHashes: [...new Set(batched)], amount });
        return;
      }
      // One request per share, so a payer who stops halfway leaves an exact
      // record of the shares that landed.
      const landed: Hex[] = [];
      try {
        for (const call of fee.calls) {
          const { hashes } = await adapter.sendCalls([call]);
          const hash = hashes[hashes.length - 1];
          if (!hash) {
            throw new Error("Adapter returned no transaction hash.");
          }
          const receipt = await adapter.waitForReceipt(hash);
          if (receipt.status === "reverted") {
            throw toWhiskError(
              new Error(`Merchant fee transfer reverted on-chain (${hash}).`),
              "Merchant fee transfer reverted on-chain.",
              "reverted_onchain",
            );
          }
          landed.push(hash);
        }
      } catch (cause) {
        settled({
          status: "unpaid",
          amount,
          error: toWhiskError(cause, "Failed to send the merchant fee."),
          ...(landed.length > 0 && { txHashes: landed }),
        });
        return;
      }
      settled({ status: "paid", txHashes: landed, amount });
    },
  };
}

/**
 * Submits `calls`, the approve and burn or the transfer, and returns their
 * hashes: one per call, or one for a whole batch. The fee, if any, rides in
 * the same batch after them when the wallet can land it atomically.
 */
export function submitWithFee(
  adapter: EvmAdapter,
  chainId: number,
  calls: EvmCall[],
  fee: FeeCharge | undefined,
  onLastSubmitted?: (hash: Hex) => void,
): Promise<Hex[]> {
  if (fee) return fee.submit(adapter, chainId, calls, onLastSubmitted);
  return adapter
    .sendCalls(calls, {
      onSubmitted: (hash, index) => {
        if (index === calls.length - 1) onLastSubmitted?.(hash);
      },
    })
    .then(({ hashes }) => hashes);
}

/**
 * Once the burn or transfer has landed: asks for the fee if it did not ride
 * along. Never throws. A fee the payer rejects or that reverts is reported
 * on the outcome, and the transfer goes on.
 */
export async function settleFee(
  adapter: EvmAdapter,
  fee: FeeCharge | undefined,
): Promise<void> {
  await fee?.settle(adapter);
}
