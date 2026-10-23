import type { StarknetChain } from "../chains/types.js";
import { callRpc, type RpcOptions } from "./jsonRpc.js";

const CONTRACT_NOT_FOUND = 20;
const FELT = /^0x[0-9a-fA-F]{1,64}$/;

/**
 * The class hash of the contract at `address`, or `null` when nothing is
 * deployed there. An account that has not been deployed yet still holds
 * tokens sent to it, but only its owner's wallet can tell that it is one.
 */
export async function getStarknetClassHashAt(
  chain: StarknetChain,
  address: string,
  options: RpcOptions = {},
): Promise<string | null> {
  return callRpc<string | null>(
    chain,
    "starknet_getClassHashAt",
    { block_id: "latest", contract_address: address },
    (r) => (typeof r === "string" && FELT.test(r) ? r : undefined),
    options,
    (code) => (code === CONTRACT_NOT_FOUND ? null : undefined),
  );
}
