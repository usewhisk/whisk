import type { StarknetChain } from "../chains/types.js";
import { callRpc, type RpcOptions } from "./jsonRpc.js";

/** `pending` until the sequencer has accepted the transaction on L2. */
export type StarknetTransactionStatus =
  | { state: "pending" }
  | { state: "success" | "reverted"; blockNumber: number };

const TXN_HASH_NOT_FOUND = 29;
const ACCEPTED = new Set(["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"]);
const NOT_YET = new Set(["RECEIVED", "CANDIDATE", "PRE_CONFIRMED"]);

/**
 * Reads the receipt over plain JSON-RPC. starknet.js refuses nodes on a spec
 * version it does not know, and public nodes move ahead of it, so the
 * receipt is read here instead. The fields used are the same from 0.8 to 0.10.
 */
export async function getStarknetTransactionStatus(
  chain: StarknetChain,
  hash: string,
  options: RpcOptions = {},
): Promise<StarknetTransactionStatus> {
  return callRpc(
    chain,
    "starknet_getTransactionReceipt",
    { transaction_hash: hash },
    (r): StarknetTransactionStatus | undefined => {
      if (typeof r !== "object" || r === null) return undefined;
      const { finality_status, execution_status, block_number } = r as {
        finality_status?: unknown;
        execution_status?: unknown;
        block_number?: unknown;
      };
      if (typeof finality_status !== "string") return undefined;
      if (NOT_YET.has(finality_status)) return { state: "pending" };
      if (!ACCEPTED.has(finality_status)) return undefined;
      if (typeof block_number !== "number") return undefined;
      if (execution_status === "SUCCEEDED") {
        return { state: "success", blockNumber: block_number };
      }
      if (execution_status === "REVERTED") {
        return { state: "reverted", blockNumber: block_number };
      }
      return undefined;
    },
    options,
    (code) => (code === TXN_HASH_NOT_FOUND ? { state: "pending" } : undefined),
  );
}
