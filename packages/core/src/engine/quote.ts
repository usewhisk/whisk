import {
  getChain,
  isValidStarknetFelt,
  isValidStellarStrkey,
} from "@usewhisk/cctp";
import { PublicKey } from "@solana/web3.js";
import { isAddress as viemIsAddress } from "viem";
import type { Quote } from "../types/quote.js";
import type { QuoteParams } from "./types.js";
import type { WhiskConfig } from "../types/config.js";
import { decideRoute } from "../routing/decide.js";
import { connectedEcosystems, planRoute } from "../routing/plan.js";
import { fitFastAllowance } from "../routing/allowance.js";
import { InvalidAddressError } from "../errors/errors.js";
import { buildCustomFeeEntries, sumFees } from "../fees/calculate.js";
import { formatUsdcAmount, parseUsdcAmount } from "./amount.js";
import { DEFAULT_FEE_BEARER } from "../types/fee.js";
import { DEFAULT_TOKEN } from "../types/token.js";
import {
  buildBridgeQuote,
  type BuildBridgeQuoteResult,
} from "./bridge/quote.js";
import { stampQuote } from "./quoteStamp.js";
import type { Chain } from "../types/chain.js";

const SEND_DURATION_MS = 15_000;

export type BuildQuoteOptions = {
  config: WhiskConfig;
};

export function rpcUrlsFor(
  config: WhiskConfig,
  chain: Chain,
): readonly string[] | undefined {
  const urls = config.rpcUrls?.[chain];
  if (urls === undefined) return undefined;
  return typeof urls === "string" ? [urls] : urls;
}

/** For a bridge, also returns the fee inputs the executor burns with. */
export async function buildQuote(
  params: QuoteParams,
  options: BuildQuoteOptions,
): Promise<{ quote: Quote; bridge?: BuildBridgeQuoteResult }> {
  const route = decideRoute(params.sourceChain, params.destinationChain);
  const token = params.token ?? DEFAULT_TOKEN;

  // Checked at quote time so a bad address is refused before anything is
  // signed.
  const destination = getChain(params.destinationChain);
  if (destination.ecosystem === "solana") {
    try {
      new PublicKey(params.recipient.address);
    } catch {
      throw new InvalidAddressError(params.recipient.address);
    }
  } else if (destination.ecosystem === "stellar") {
    if (!isValidStellarStrkey(params.recipient.address)) {
      throw new InvalidAddressError(params.recipient.address);
    }
  } else if (destination.ecosystem === "starknet") {
    if (!isValidStarknetFelt(params.recipient.address)) {
      throw new InvalidAddressError(params.recipient.address);
    }
  } else if (!viemIsAddress(params.recipient.address)) {
    throw new InvalidAddressError(params.recipient.address);
  }

  if (route.kind === "send") {
    const customFeeEntries = buildCustomFeeEntries(
      options.config.feePolicy,
      token,
    );
    const fees = sumFees(customFeeEntries, token);
    const amount = parseUsdcAmount(params.amount);
    const customFee = customFeeEntries.length
      ? parseUsdcAmount(fees.total)
      : 0n;
    const quote: Quote = {
      ...stampQuote(),
      feeMode: "maxFee",
      route,
      recipient: params.recipient,
      amountIn: customFeeEntries.length
        ? formatUsdcAmount(amount + customFee)
        : params.amount,
      amountOut: params.amount,
      amountBurned: params.amount,
      token,
      fees,
      subunits: {
        requested: amount,
        amountIn: amount + customFee,
        burnAmount: 0n,
        burnFee: 0n,
        forwarderFee: 0n,
        maxFee: 0n,
        amountOut: amount,
        customFee,
      },
      estimatedDurationMs: SEND_DURATION_MS,
    };
    return { quote };
  }

  const plan = await fitFastAllowance(
    planRoute({
      source: params.sourceChain,
      destination: params.destinationChain,
      connected: connectedEcosystems(params.adapter, params.destinationAdapter),
      useForwarder: options.config.useForwarder ?? true,
    }),
    parseUsdcAmount(params.amount),
    options.config.fetch,
  );

  const rpcUrls = rpcUrlsFor(options.config, params.sourceChain);
  const result = await buildBridgeQuote({
    network: plan.network,
    source: plan.source,
    destination: plan.destination,
    sourceChain: params.sourceChain,
    destinationChain: params.destinationChain,
    recipient: params.recipient,
    amount: params.amount,
    feeBearer: options.config.feeBearer ?? DEFAULT_FEE_BEARER,
    useForwarder: plan.mint.kind === "forwarder",
    plan,
    ...(options.config.forwarderFeeLevel && {
      forwarderLevel: options.config.forwarderFeeLevel,
    }),
    ...(rpcUrls && { rpcUrls }),
    ...(options.config.feePolicy && { customFee: options.config.feePolicy }),
    ...(options.config.fetch && { fetch: options.config.fetch }),
    token,
  });

  return { quote: result.quote, bridge: result };
}
