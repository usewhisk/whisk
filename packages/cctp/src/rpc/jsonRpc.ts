import type { EvmChain } from "../chains/types.js";
import { ProtocolError } from "../errors.js";

export type RpcOptions = {
  /** Tried in order before the chain's default RPCs. */
  rpcUrls?: readonly string[];
  fetch?: typeof fetch;
};

/**
 * One JSON-RPC call, tried on each URL in turn until one returns a result
 * that `parse` accepts. Public RPCs fail often enough that one bad answer is
 * not a verdict.
 */
export async function callRpc<T>(
  chain: EvmChain,
  method: string,
  params: readonly unknown[],
  parse: (result: unknown) => T | undefined,
  options: RpcOptions = {},
): Promise<T> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
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
      const payload: unknown = await res.json();
      const result =
        typeof payload === "object" && payload !== null && "result" in payload
          ? parse(payload.result)
          : undefined;
      if (result !== undefined) return result;
      failures.push(`${url}: ${JSON.stringify(payload)}`);
    } catch (err) {
      failures.push(
        `${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  throw new ProtocolError(
    "rpc_unavailable",
    `${method} on ${chain.id} failed: ${failures.join("; ")}`,
  );
}

export async function getBlockNumber(
  chain: EvmChain,
  options: RpcOptions = {},
): Promise<bigint> {
  return callRpc(
    chain,
    "eth_blockNumber",
    [],
    (r) =>
      typeof r === "string" && /^0x[0-9a-fA-F]+$/.test(r)
        ? BigInt(r)
        : undefined,
    options,
  );
}
