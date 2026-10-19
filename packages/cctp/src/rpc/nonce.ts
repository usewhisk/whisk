import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { hash } from "starknet";
import type { StarknetChain, StellarChain } from "../chains/types.js";
import { ProtocolError } from "../errors.js";
import { callRpc, type RpcOptions } from "./jsonRpc.js";

const IS_NONCE_USED_SELECTOR = hash.getSelectorFromName("is_nonce_used");

function bytes32(nonce: `0x${string}`): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) {
    throw new ProtocolError("rpc_unavailable", `nonce ${nonce} is not bytes32`);
  }
  return nonce.slice(2).toLowerCase();
}

/** `MessageTransmitter.is_nonce_used(u256)` on Starknet. */
export async function isStarknetNonceUsed(
  chain: StarknetChain,
  nonce: `0x${string}`,
  options: RpcOptions = {},
): Promise<boolean> {
  const hex = bytes32(nonce);
  return callRpc(
    chain,
    "starknet_call",
    {
      request: {
        contract_address: chain.messageTransmitter,
        entry_point_selector: IS_NONCE_USED_SELECTOR,
        // A u256 goes over the wire as its low then high 128 bits.
        calldata: [`0x${hex.slice(32)}`, `0x${hex.slice(0, 32)}`],
      },
      // Public Starknet RPCs reject the "pending" tag starknet.js defaults to.
      block_id: "latest",
    },
    (r) =>
      Array.isArray(r) && (r[0] === "0x0" || r[0] === "0x1")
        ? r[0] === "0x1"
        : undefined,
    options,
  );
}

/**
 * `MessageTransmitter.is_nonce_used(BytesN<32>)` on Stellar, read by
 * simulating the call. Simulation needs a source account but no signature,
 * so the USDC issuer, which always exists, stands in.
 */
export async function isStellarNonceUsed(
  chain: StellarChain,
  nonce: `0x${string}`,
  options: RpcOptions = {},
): Promise<boolean> {
  const tx = new TransactionBuilder(new Account(chain.usdcIssuer, "0"), {
    fee: BASE_FEE,
    networkPassphrase: chain.networkPassphrase,
  })
    .addOperation(
      new Contract(chain.messageTransmitter).call(
        "is_nonce_used",
        nativeToScVal(Buffer.from(bytes32(nonce), "hex"), { type: "bytes" }),
      ),
    )
    .setTimeout(30)
    .build();
  return callRpc(
    chain,
    "simulateTransaction",
    { transaction: tx.toXDR() },
    (r) => {
      const results = (r as { results?: { xdr?: unknown }[] } | null)?.results;
      const value = results?.[0]?.xdr;
      if (typeof value !== "string") return undefined;
      const used: unknown = scValToNative(xdr.ScVal.fromXDR(value, "base64"));
      return typeof used === "boolean" ? used : undefined;
    },
    options,
  );
}
