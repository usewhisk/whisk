import type { CctpChain, EvmChain } from "../chains/types.js";
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
  chain: Pick<CctpChain, "id" | "defaultRpcUrls">,
  method: string,
  params: readonly unknown[] | Record<string, unknown>,
  parse: (result: unknown) => T | undefined,
  options: RpcOptions = {},
): Promise<T> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const urls = [...(options.rpcUrls ?? []), ...chain.defaultRpcUrls];
  const failures: string[] = [];
  for (let i = 0, behind = 0; i < urls.length; i++) {
    const url = urls[i]!;
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
      // Arc's primary endpoint is load-balanced, and a backend behind the
      // head answers -32014 until it catches up. Ask the same URL again.
      if (errorCode(payload) === LAGGING_BACKEND && behind < LAG_RETRIES) {
        behind += 1;
        await new Promise((resolve) => setTimeout(resolve, 250 * behind));
        i -= 1;
        continue;
      }
      behind = 0;
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

const LAGGING_BACKEND = -32014;
const LAG_RETRIES = 3;

function errorCode(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) return undefined;
  const error = (payload as { error?: { code?: unknown } }).error;
  return error?.code;
}

/** `eth_gasPrice`, in wei. */
export async function getGasPrice(
  chain: EvmChain,
  options: RpcOptions = {},
): Promise<bigint> {
  return callRpc(
    chain,
    "eth_gasPrice",
    [],
    (r) =>
      typeof r === "string" && /^0x[0-9a-fA-F]+$/.test(r)
        ? BigInt(r)
        : undefined,
    options,
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

const USED_NONCES = "0xfeb61724";

/**
 * Whether `MessageTransmitterV2.usedNonces(nonce)` is set: the message was
 * already received on this chain and minting it again would revert.
 */
export async function isNonceUsed(
  chain: EvmChain,
  nonce: `0x${string}`,
  options: RpcOptions = {},
): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) {
    throw new ProtocolError("rpc_unavailable", `nonce ${nonce} is not bytes32`);
  }
  return callRpc(
    chain,
    "eth_call",
    [
      { to: chain.messageTransmitter, data: `${USED_NONCES}${nonce.slice(2)}` },
      "latest",
    ],
    (r) =>
      typeof r === "string" && /^0x[0-9a-fA-F]{64}$/.test(r)
        ? BigInt(r) !== 0n
        : undefined,
    options,
  );
}

export type TransactionStatus = "success" | "reverted" | "unknown";

/** `unknown` until the transaction is mined, or if the node never saw it. */
export async function getTransactionStatus(
  chain: EvmChain,
  hash: `0x${string}`,
  options: RpcOptions = {},
): Promise<TransactionStatus> {
  return callRpc(
    chain,
    "eth_getTransactionReceipt",
    [hash],
    (r): TransactionStatus | undefined => {
      if (r === null) return "unknown";
      if (typeof r !== "object") return undefined;
      const status = (r as { status?: unknown }).status;
      if (status === "0x1") return "success";
      if (status === "0x0") return "reverted";
      return undefined;
    },
    options,
  );
}

const BALANCE_OF = "0x70a08231";

/** The USDC ERC-20 balance of `owner`, in subunits. */
export async function getUsdcBalance(
  chain: EvmChain,
  owner: `0x${string}`,
  options: RpcOptions = {},
): Promise<bigint> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    throw new ProtocolError("rpc_unavailable", `${owner} is not an address`);
  }
  return callRpc(
    chain,
    "eth_call",
    [
      {
        to: chain.usdc,
        data: `${BALANCE_OF}${owner.slice(2).padStart(64, "0")}`,
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
