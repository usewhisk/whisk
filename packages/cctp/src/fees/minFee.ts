import type { EvmChain } from "../chains/types.js";
import { InvalidInputError, ProtocolError } from "../errors.js";

const GET_MIN_FEE_AMOUNT = "0x516990e3";

export type GetStandardMinFeeOptions = {
  /** Tried in order before the chain's default RPCs. */
  rpcUrls?: readonly string[];
  fetch?: typeof fetch;
};

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
  const doFetch = options.fetch ?? globalThis.fetch;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [
      {
        to: chain.tokenMessenger,
        data: `${GET_MIN_FEE_AMOUNT}${amount.toString(16).padStart(64, "0")}`,
      },
      "latest",
    ],
  });
  const urls = [...(options.rpcUrls ?? []), ...chain.defaultRpcUrls];
  const failures: string[] = [];
  for (const url of urls) {
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      if (!res.ok) {
        failures.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      return parseUint256(await res.json(), chain);
    } catch (err) {
      failures.push(
        `${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  throw new ProtocolError(
    "fee_unavailable",
    `could not read getMinFeeAmount on ${chain.id}: ${failures.join("; ")}`,
  );
}

function parseUint256(payload: unknown, chain: EvmChain): bigint {
  const result =
    typeof payload === "object" && payload !== null && "result" in payload
      ? payload.result
      : undefined;
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(result)) {
    const error =
      typeof payload === "object" && payload !== null && "error" in payload
        ? JSON.stringify(payload.error)
        : JSON.stringify(result);
    throw new ProtocolError(
      "fee_unavailable",
      `getMinFeeAmount on ${chain.id} returned ${error}`,
    );
  }
  return BigInt(result);
}
