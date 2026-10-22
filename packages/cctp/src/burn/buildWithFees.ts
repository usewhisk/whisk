import { encodeFunctionData, type Address as ViemAddress } from "viem";
import type { Address, CctpChain } from "../chains/types.js";
import { ANY_DESTINATION_CALLER } from "../forwarder/hookData.js";
import { tokenMessengerWithFeesAbi } from "../abi/tokenMessengerWithFees.js";
import { usdcAbi } from "../abi/usdc.js";
import { isAddress } from "../encoding/address.js";
import { InvalidInputError, UnsupportedError } from "../errors.js";
import { encodeMintRecipient } from "./recipient.js";
import type { EvmCall } from "./types.js";

export type BuildBurnWithFeesIntentInput = {
  source: CctpChain;
  destination: CctpChain;
  /** Exactly the amount the signed quote was requested for. */
  amount: bigint;
  /** The quote's USDC fee, collected by the contract on top of `amount`. */
  fee: bigint;
  mintRecipient: Address | string;
  signedQuote: `0x${string}`;
  /** Reserved by Circle for refunds it does not make today. */
  refundAddress: Address | string;
  /** Defaults to `amount + fee`. */
  approveAmount?: bigint;
};

export type BurnWithFeesIntent = {
  calls: EvmCall[];
  amount: bigint;
  fee: bigint;
  mintRecipientBytes32: `0x${string}`;
};

/**
 * Approve and `depositForBurnWithFees` calls for a burn whose Fast and
 * forwarding fees were paid upfront from a signed quote. The contract adds
 * Circle's forwarding hook itself when the quote includes a `FORWARD` fee.
 */
export function buildBurnWithFeesIntent(
  input: BuildBurnWithFeesIntentInput,
): BurnWithFeesIntent {
  const { source, destination } = input;
  if (source.ecosystem !== "evm" || !source.tokenMessengerWithFees) {
    throw new UnsupportedError(
      "unsupported_chain",
      `${source.id} has no TokenMessengerWithFees, so it cannot pay fees upfront`,
    );
  }
  // A Stellar mint needs the CctpForwarder hook, and Circle binds custom hook
  // data only to a FORWARD fee, which Stellar does not offer.
  if (destination.ecosystem === "stellar") {
    throw new UnsupportedError(
      "unsupported_chain",
      "burns to Stellar carry custom hook data and cannot pay fees upfront",
    );
  }
  if (source.cctpDomain === destination.cctpDomain) {
    throw new InvalidInputError(
      "no_route",
      `Source and destination domains are identical (${source.cctpDomain})`,
    );
  }
  if (input.amount <= 0n || input.fee < 0n) {
    throw new InvalidInputError(
      "invalid_amount",
      `amount must be positive and fee non-negative, got ${input.amount} and ${input.fee}`,
    );
  }
  if (!isAddress(input.refundAddress)) {
    throw new InvalidInputError(
      "invalid_address",
      `refundAddress is not a valid EVM address: ${input.refundAddress}`,
    );
  }
  const mintRecipientBytes32 = encodeMintRecipient(
    destination,
    input.mintRecipient,
  );
  const approveAmount = input.approveAmount ?? input.amount + input.fee;
  if (approveAmount < input.amount + input.fee) {
    throw new InvalidInputError(
      "invalid_amount",
      `approveAmount (${approveAmount}) must cover amount plus fee (${input.amount + input.fee})`,
    );
  }

  const calls: EvmCall[] = [
    {
      to: source.usdc,
      data: encodeFunctionData({
        abi: usdcAbi,
        functionName: "approve",
        args: [source.tokenMessengerWithFees as ViemAddress, approveAmount],
      }),
      value: 0n,
    },
    {
      to: source.tokenMessengerWithFees,
      data: encodeFunctionData({
        abi: tokenMessengerWithFeesAbi,
        functionName: "depositForBurnWithFees",
        args: [
          input.amount,
          destination.cctpDomain,
          mintRecipientBytes32,
          source.usdc as ViemAddress,
          ANY_DESTINATION_CALLER,
          {
            signedQuote: input.signedQuote,
            refundAddress: input.refundAddress as ViemAddress,
          },
        ],
      }),
      value: 0n,
    },
  ];
  return { calls, amount: input.amount, fee: input.fee, mintRecipientBytes32 };
}
