/**
 * Quote builder.
 *
 * Produces the {@link Quote} the UI renders before the user confirms.
 * Same-chain Send has no fees — the recipient gets exactly what the
 * sender pays. Bridge quotes fetch fees from Iris.
 */
import {
  getChain,
  isValidStarknetFelt,
  isValidStellarStrkey,
  type ForwarderFeeTier,
} from "@usewhisk/cctp";
import { PublicKey } from "@solana/web3.js";
import { isAddress as viemIsAddress } from "viem";
import type { Quote } from "../types/quote.js";
import type { QuoteParams } from "./types.js";
import type { WhiskConfig } from "../types/config.js";
import { decideRoute } from "../routing/decide.js";
import { InvalidAddressError } from "../errors/errors.js";
import { buildCustomFeeEntries, sumFees } from "../fees/calculate.js";
import { formatUsdcAmount, parseUsdcAmount } from "./amount.js";
import { DEFAULT_FEE_BEARER } from "../types/fee.js";
import { DEFAULT_TOKEN } from "../types/token.js";
import {
  buildBridgeQuote,
  type BuildBridgeQuoteResult,
} from "./bridge/quote.js";

const SEND_DURATION_MS = 15_000;

export type BuildQuoteOptions = {
  /** Resolved Whisk config (mode is already inferred). */
  config: WhiskConfig;
  /** Forwarder fee level to apply on bridge quotes. Defaults to `"med"`. */
  forwarderLevel?: keyof ForwarderFeeTier;
};

/**
 * Build a quote and (for bridges) return the fee inputs the executor
 * needs to encode the burn call. For same-chain Send the executor
 * computes its own call data, so only the Quote is meaningful.
 */
export async function buildQuote(
  params: QuoteParams,
  options: BuildQuoteOptions,
): Promise<{ quote: Quote; bridge?: BuildBridgeQuoteResult }> {
  const route = decideRoute(params.sourceChain, params.destinationChain);
  const token = params.token ?? DEFAULT_TOKEN;

  // Recipient validation runs at quote time so the UI can reject
  // obviously-bad addresses before the user signs anything. Each
  // ecosystem has its own format:
  //   EVM      0x-prefixed 20-byte hex
  //   Solana   base58 32-byte pubkey
  //   Stellar  G/M/C strkey
  //   Starknet 0x-prefixed felt252 (up to 64 hex chars)
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
    const quote: Quote = {
      route,
      recipient: params.recipient,
      amountIn: customFeeEntries.length
        ? formatUsdcAmount(
            parseUsdcAmount(params.amount) + parseUsdcAmount(fees.total),
          )
        : params.amount,
      amountOut: params.amount,
      amountBurned: params.amount,
      token,
      fees,
      estimatedDurationMs: SEND_DURATION_MS,
    };
    return { quote };
  }

  const source = getChain(params.sourceChain);
  const network = options.config.mode ?? source.network;

  const result = await buildBridgeQuote({
    network,
    source,
    destination,
    sourceChain: params.sourceChain,
    destinationChain: params.destinationChain,
    recipient: params.recipient,
    amount: params.amount,
    feeBearer: options.config.feeBearer ?? DEFAULT_FEE_BEARER,
    useForwarder: options.config.useForwarder ?? true,
    ...(options.forwarderLevel !== undefined && {
      forwarderLevel: options.forwarderLevel,
    }),
    ...(options.config.feePolicy && { customFee: options.config.feePolicy }),
    ...(options.config.fetch && { fetch: options.config.fetch }),
    token,
  });

  return { quote: result.quote, bridge: result };
}
