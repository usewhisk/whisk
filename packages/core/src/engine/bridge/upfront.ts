import {
  buildBurnIntent,
  buildBurnWithFeesIntent,
  type BuildBurnIntentInput,
} from "@usewhisk/cctp";
import type { EvmCall } from "../types.js";

/** Circle's signed quote for fees paid on the source chain. */
export type UpfrontFee = {
  signedQuote: `0x${string}`;
  /** The signed fee, collected by `TokenMessengerWithFees` with the burn. */
  fee: bigint;
  /** The burn plus the fee the payer was shown, which bounds the signed one. */
  approveAmount: bigint;
};

/** Approve and burn calls, through `TokenMessengerWithFees` when paid upfront. */
export function evmBurnCalls(
  burn: BuildBurnIntentInput,
  upfront: UpfrontFee | undefined,
  payer: `0x${string}`,
): EvmCall[] {
  const intent = upfront
    ? buildBurnWithFeesIntent({
        source: burn.source,
        destination: burn.destination,
        amount: burn.amount,
        fee: upfront.fee,
        mintRecipient: burn.mintRecipient,
        signedQuote: upfront.signedQuote,
        refundAddress: payer,
        approveAmount: upfront.approveAmount,
      })
    : buildBurnIntent(burn);
  return intent.calls.map((c) => ({ to: c.to, data: c.data, value: c.value }));
}
