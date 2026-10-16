/**
 * Bridge quote.
 *
 * Fetches fee tiers from Iris, computes the protocol burn fee and
 * Forwarder fee for the requested amount, and projects everything into
 * a {@link Quote} the UI can render.
 *
 * Fee math (USDC subunits, 6 decimals):
 *
 *   burnFee     = (burnAmount × minimumFee) / 1_000_000   (Iris bps × 100)
 *   forwarderFee = chosen tier of forwardFee.low/med/high
 *   maxFee       = burnFee + forwarderFee
 *
 * `feeBearer` decides who absorbs the fees:
 *
 *   sender    burnAmount = amount + maxFee   — sender pays more,
 *                                                recipient nets `amount`.
 *   receiver  burnAmount = amount            — sender debits `amount`,
 *                                                recipient nets amount − maxFee.
 */
import {
  computeMaxFee,
  getBurnFees,
  pickFeeTier,
  type BurnFeeTier,
  type CctpChain,
  type CctpNetwork,
  type ForwarderFeeTier,
} from "@usewhisk/cctp";
import { ConfigError } from "../../errors/errors.js";
import { DEFAULT_TOKEN, type Token } from "../../types/token.js";
import type { Chain } from "../../types/chain.js";
import type { FeeBearer, FeeEntry, FeePolicy } from "../../types/fee.js";
import type { Quote } from "../../types/quote.js";
import type { ResolvedRecipient } from "../../types/recipient.js";
import { buildCustomFeeEntries, sumFees } from "../../fees/calculate.js";
import { formatUsdcAmount, parseUsdcAmount } from "../amount.js";

export type BuildBridgeQuoteInput = {
  network: CctpNetwork;
  source: CctpChain;
  destination: CctpChain;
  sourceChain: Chain;
  destinationChain: Chain;
  recipient: ResolvedRecipient;
  /** Human-readable amount, e.g. `"25"` or `"1.5"`. */
  amount: string;
  feeBearer: FeeBearer;
  /** Defaults to `"med"`. */
  forwarderLevel?: keyof ForwarderFeeTier;
  /** Default `true` — Whisk uses the Forwarder by default. */
  useForwarder?: boolean;
  /** Pre-fetched tier; supply to skip the Iris call. */
  tier?: BurnFeeTier;
  token?: Token;
  /**
   * Optional integrator-supplied merchant fee. Surfaced as an extra
   * `custom` entry in the quote and as a `transfer` call prepended to
   * the source-chain submission. Sender always pays — `feeBearer`
   * does not affect customFee.
   */
  customFee?: FeePolicy;
};

/** Estimated end-to-end duration for a Fast Transfer bridge. */
const FAST_BRIDGE_DURATION_MS = 30_000;

export type BuildBridgeQuoteResult = {
  quote: Quote;
  /** Fee inputs preserved for the executor — same call uses the same tier. */
  tier: BurnFeeTier;
  burnAmount: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  maxFee: bigint;
  /** Merchant-fee amount in subunits (0n when no policy is set). */
  customFeeAmount: bigint;
};

export async function buildBridgeQuote(
  input: BuildBridgeQuoteInput,
): Promise<BuildBridgeQuoteResult> {
  if (input.source.cctpDomain === input.destination.cctpDomain) {
    throw new ConfigError(
      "buildBridgeQuote: source and destination chains are identical — use a same-chain Send.",
    );
  }
  if (!input.source.supportsFastTransfer) {
    throw new ConfigError(
      `Chain "${input.source.name}" does not support Fast Transfer. Bridges from this chain are not available in this build.`,
    );
  }

  // Iris's auto-relayer ("Forwarding Service") only relays to a subset
  // of destination chains — Stellar and Starknet aren't included. For
  // those destinations the engine queries Iris fees WITHOUT
  // `?forward=true` and skips the forwarder-fee component of maxFee
  // (the on-chain manual receive_message pays its own gas).
  const destSkipsIrisForwarder =
    input.destination.ecosystem === "stellar" ||
    input.destination.ecosystem === "starknet";
  const useForwarder = destSkipsIrisForwarder
    ? false
    : (input.useForwarder ?? true);
  const forwarderLevel = input.forwarderLevel ?? "med";
  const amount = parseUsdcAmount(input.amount);
  const token = input.token ?? DEFAULT_TOKEN;

  const tier =
    input.tier ??
    pickFeeTier(
      await getBurnFees(
        input.network,
        input.source.cctpDomain,
        input.destination.cctpDomain,
        { includeForwarderFee: !destSkipsIrisForwarder },
      ),
    );

  // First pass computes fees against the raw `amount` to derive the
  // sender/receiver split. The burn fee depends on `burnAmount`, so we
  // recompute against the grossed-up total once we know it.
  const initial = computeMaxFee({
    amount,
    tier,
    forwarderLevel,
    includeForwarder: useForwarder,
  });

  let burnAmount: bigint;
  let recipientAmount: bigint;
  let burnFee: bigint;
  let forwarderFee: bigint;
  let maxFee: bigint;

  if (input.feeBearer === "sender") {
    burnAmount = amount + initial.maxFee;
    const recomputed = computeMaxFee({
      amount: burnAmount,
      tier,
      forwarderLevel,
      includeForwarder: useForwarder,
    });
    burnFee = recomputed.burnFee;
    forwarderFee = recomputed.forwarderFee;
    maxFee = recomputed.maxFee;
    recipientAmount = burnAmount - maxFee;
    // Recomputed burnFee may grow with the larger burnAmount; top up
    // once more so the recipient still nets at least `amount`.
    if (recipientAmount < amount) {
      const shortfall = amount - recipientAmount;
      burnAmount += shortfall;
      const final = computeMaxFee({
        amount: burnAmount,
        tier,
        forwarderLevel,
        includeForwarder: useForwarder,
      });
      burnFee = final.burnFee;
      forwarderFee = final.forwarderFee;
      maxFee = final.maxFee;
      recipientAmount = burnAmount - maxFee;
    }
  } else {
    burnAmount = amount;
    burnFee = initial.burnFee;
    forwarderFee = initial.forwarderFee;
    maxFee = initial.maxFee;
    recipientAmount = burnAmount - maxFee;
    if (recipientAmount < 0n) {
      throw new ConfigError(
        "buildBridgeQuote: amount is too small to cover bridge fees. Increase the amount or switch feeBearer to 'sender'.",
      );
    }
  }

  const entries: FeeEntry[] = [];
  const customFeeEntries = buildCustomFeeEntries(input.customFee, token);
  entries.push(...customFeeEntries);
  if (burnFee > 0n) {
    entries.push({
      kind: "protocol",
      amount: formatUsdcAmount(burnFee),
      token,
      description: "CCTP protocol fee",
    });
  }
  if (forwarderFee > 0n) {
    entries.push({
      kind: "forwarder",
      amount: formatUsdcAmount(forwarderFee),
      token,
      description: "Destination mint fee",
    });
  }

  let customFeeAmount = 0n;
  if (input.customFee?.value) {
    try {
      customFeeAmount = parseUsdcAmount(input.customFee.value);
    } catch {
      customFeeAmount = 0n;
    }
  }
  // Sender always carries the merchant fee — it's an integrator
  // monetization knob, not a protocol fee, so `feeBearer` is bypassed.
  const senderDebit =
    (input.feeBearer === "sender" ? burnAmount : amount) + customFeeAmount;

  const quote: Quote = {
    route: {
      kind: "bridge",
      sourceChain: input.sourceChain,
      destinationChain: input.destinationChain,
    },
    recipient: input.recipient,
    amountIn: formatUsdcAmount(senderDebit),
    amountOut: formatUsdcAmount(recipientAmount),
    amountBurned: formatUsdcAmount(burnAmount),
    token,
    fees: sumFees(entries, token),
    estimatedDurationMs: FAST_BRIDGE_DURATION_MS,
  };

  return {
    quote,
    tier,
    burnAmount,
    burnFee,
    forwarderFee,
    maxFee,
    customFeeAmount,
  };
}
