import type { EvmChain } from "../chains/types.js";
import { InvalidInputError } from "../errors.js";
import { callRpc, type RpcOptions } from "../rpc/jsonRpc.js";

const GET_MIN_FEE_AMOUNT = "0x516990e3";

export type GetStandardMinFeeOptions = RpcOptions;

/**
 * `TokenMessengerV2.getMinFeeAmount(amount)`: the least `maxFee` a Standard
 * burn of `amount` may carry on a chain with Circle's fee switch.
 */
export async function getStandardMinFee(
  chain: EvmChain,
  amount: bigint,
  options: GetStandardMinFeeOptions = {},
): Promise<bigint> {
  if (!chain.capabilities.standardFeeSwitch) {
    throw new InvalidInputError(
      "invalid_chain",
      `${chain.id} has no getMinFeeAmount; its TokenMessengerV2 reverts the call`,
    );
  }
  if (amount < 0n) {
    throw new InvalidInputError(
      "invalid_amount",
      `amount must be non-negative, got ${amount}`,
    );
  }
  return callRpc(
    chain,
    "eth_call",
    [
      {
        to: chain.tokenMessenger,
        data: `${GET_MIN_FEE_AMOUNT}${amount.toString(16).padStart(64, "0")}`,
      },
      "latest",
    ],
    (r) =>
      typeof r === "string" && /^0x[0-9a-fA-F]{64}$/.test(r)
        ? BigInt(r)
        : undefined,
    options,
  );
}
