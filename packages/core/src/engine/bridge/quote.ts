/**
 * Bridge quote.
 *
 * Fetches fee tiers from Iris, computes the protocol burn fee and
 * Forwarder fee for the requested amount, and projects everything into
 * a {@link Quote} the UI can render.
 *
 * Fee math (USDC subunits, 6 decimals):
 *
 *   burnFee      = max(burnAmount × Iris bps, getMinFeeAmount on fee-switch chains)
 *   forwarderFee = forwardFee at the chosen level
 *   maxFee       = burnFee + 10% on Fast + forwarderFee
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
  getStandardMinFee,
  pickFeeTier,
  type BurnFeeTier,
  type CctpChain,
  type ComputeMaxFeeResult,
  type Network,
  type ForwarderFeeTier,
} from "@usewhisk/cctp";
import { ConfigError } from "../../errors/errors.js";
import { DEFAULT_TOKEN, type Token } from "../../types/token.js";
import type { Chain } from "../../types/chain.js";
import type { FeeBearer, FeeEntry, FeePolicy } from "../../types/fee.js";
import type { Quote } from "../../types/quote.js";
import type { ResolvedRecipient } from "../../types/recipient.js";
import { buildCustomFeeEntries, sumFees } from "../../fees/calculate.js";
import type { RoutePlan } from "../../routing/plan.js";
import { formatUsdcAmount, parseUsdcAmount } from "../amount.js";
import { stampQuote } from "../quoteStamp.js";

export type BuildBridgeQuoteInput = {
  network: Network;
  source: CctpChain;
  destination: CctpChain;
  sourceChain: Chain;
  destinationChain: Chain;
  recipient: ResolvedRecipient;
  /** Human-readable amount, e.g. `"25"` or `"1.5"`. */
  amount: string;
  feeBearer: FeeBearer;
  /** Defaults to {@link defaultForwarderLevel}. */
  forwarderLevel?: ForwarderLevel;
  /** Whether the plan has Circle forward the mint. Default `true`. */
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
  fetch?: typeof fetch;
  /** Tried before the source chain's default RPCs for `getMinFeeAmount`. */
  rpcUrls?: readonly string[];
  plan: RoutePlan;
};

export type ForwarderLevel = Extract<keyof ForwarderFeeTier, "med" | "high">;

/** Circle's buffer advice for Fast is 10 to 20%. Only `feeExecuted` is taken. */
export const FAST_FEE_BUFFER_BPS = 1000;

/**
 * `high` costs a fraction of a cent over `med` into most chains and guards
 * the mint against a gas rise. Into Ethereum the gap is about 0.30 USDC, all
 * of it spent as gas, so `med` is the default there.
 */
export function defaultForwarderLevel(destination: CctpChain): ForwarderLevel {
  return destination.cctpDomain === 0 ? "med" : "high";
}

type FeeContext = Pick<
  BuildBridgeQuoteInput,
  "source" | "plan" | "fetch" | "rpcUrls"
> & {
  tier: BurnFeeTier;
  forwarderLevel: ForwarderLevel;
  useForwarder: boolean;
};

/**
 * Fees for burning exactly `amount`. `buffered: false` gives what Circle
 * charges today, which `send` checks against the confirmed `maxFee`.
 */
export async function computeBridgeFees(
  ctx: FeeContext,
  amount: bigint,
  { buffered }: { buffered: boolean },
): Promise<ComputeMaxFeeResult> {
  const minBurnFee =
    ctx.plan.speed === "standard" &&
    ctx.source.ecosystem === "evm" &&
    ctx.source.capabilities.standardFeeSwitch
      ? await getStandardMinFee(ctx.source, amount, {
          ...(ctx.rpcUrls && { rpcUrls: ctx.rpcUrls }),
          ...(ctx.fetch && { fetch: ctx.fetch }),
        })
      : 0n;
  return computeMaxFee({
    amount,
    tier: ctx.tier,
    forwarderLevel: ctx.forwarderLevel,
    includeForwarder: ctx.useForwarder,
    minBurnFee,
    burnFeeBufferBps:
      buffered && ctx.plan.speed === "fast" ? FAST_FEE_BUFFER_BPS : 0,
  });
}

/**
 * Upfront needs a source with `TokenMessengerWithFees`, a sender who pays
 * the fees, and a fee to pay: a Fast transfer or one Circle forwards.
 * `depositForBurnWithFees` takes no `maxFee`, so a Standard burn that owes an
 * on-chain minimum stays on `maxFee`, and Stellar's custom hook data has no
 * upfront form.
 */
function chooseFeeMode(
  input: BuildBridgeQuoteInput,
  useForwarder: boolean,
  burnFee: bigint,
): Quote["feeMode"] {
  const { source, destination, plan } = input;
  const eligible =
    input.feeBearer === "sender" &&
    source.ecosystem === "evm" &&
    source.capabilities.upfrontFeeSource &&
    destination.ecosystem !== "stellar" &&
    (plan.speed === "fast" || (useForwarder && burnFee === 0n));
  return eligible ? "upfront" : "maxFee";
}

export async function fetchFeeTier(
  input: Pick<
    BuildBridgeQuoteInput,
    "network" | "source" | "destination" | "plan" | "fetch"
  > & { useForwarder: boolean },
): Promise<BurnFeeTier> {
  return pickFeeTier(
    await getBurnFees(
      input.network,
      input.source.cctpDomain,
      input.destination.cctpDomain,
      {
        includeForwarderFee: input.useForwarder,
        ...(input.fetch && { fetch: input.fetch }),
      },
    ),
    input.plan.speed,
  );
}

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
  const useForwarder = input.useForwarder ?? true;
  const forwarderLevel =
    input.forwarderLevel ?? defaultForwarderLevel(input.destination);
  const amount = parseUsdcAmount(input.amount);
  const token = input.token ?? DEFAULT_TOKEN;

  const tier = input.tier ?? (await fetchFeeTier({ ...input, useForwarder }));
  const ctx: FeeContext = {
    source: input.source,
    plan: input.plan,
    tier,
    forwarderLevel,
    useForwarder,
    ...(input.fetch && { fetch: input.fetch }),
    ...(input.rpcUrls && { rpcUrls: input.rpcUrls }),
  };
  const fees = (burn: bigint) =>
    computeBridgeFees(ctx, burn, { buffered: true });

  // First pass computes fees against the raw `amount` to derive the
  // sender/receiver split. The burn fee depends on `burnAmount`, so we
  // recompute against the grossed-up total once we know it.
  const initial = await fees(amount);
  const feeMode = chooseFeeMode(input, useForwarder, initial.burnFee);

  let burnAmount: bigint;
  let recipientAmount: bigint;
  let burnFee: bigint;
  let forwarderFee: bigint;
  let maxFee: bigint;

  if (feeMode === "upfront") {
    // Circle collects the fee beside the burn, so the whole amount mints.
    // `maxFee` holds the shown fee, the most the signed quote may charge.
    burnAmount = amount;
    burnFee = initial.burnFee;
    forwarderFee = initial.forwarderFee;
    maxFee = initial.maxFee;
    recipientAmount = amount;
  } else if (input.feeBearer === "sender") {
    burnAmount = amount + initial.maxFee;
    const recomputed = await fees(burnAmount);
    burnFee = recomputed.burnFee;
    forwarderFee = recomputed.forwarderFee;
    maxFee = recomputed.maxFee;
    recipientAmount = burnAmount - maxFee;
    // Recomputed burnFee may grow with the larger burnAmount; top up
    // once more so the recipient still nets at least `amount`.
    if (recipientAmount < amount) {
      const shortfall = amount - recipientAmount;
      burnAmount += shortfall;
      const final = await fees(burnAmount);
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
  // The protocol line shows its share of `maxFee`, buffer included, so the
  // lines add up to what the payer is charged at most.
  const protocolCap = maxFee - forwarderFee;
  if (protocolCap > 0n) {
    entries.push({
      kind: "protocol",
      amount: formatUsdcAmount(protocolCap),
      token,
      description:
        protocolCap > burnFee
          ? "CCTP protocol fee, at most"
          : "CCTP protocol fee",
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
    feeMode === "upfront"
      ? amount + maxFee + customFeeAmount
      : (input.feeBearer === "sender" ? burnAmount : amount) + customFeeAmount;

  const quote: Quote = {
    ...stampQuote(),
    feeMode,
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
    subunits: {
      requested: amount,
      amountIn: senderDebit,
      burnAmount,
      burnFee,
      forwarderFee,
      maxFee,
      amountOut: recipientAmount,
      customFee: customFeeAmount,
    },
    estimatedDurationMs: input.plan.etaSeconds.max * 1000,
    plan: input.plan,
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
