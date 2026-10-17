import {
  decodeFunctionData,
  getAddress,
  slice,
  toFunctionSelector,
  type Abi,
} from "viem";
import {
  messageTransmitterV2Abi,
  tokenMessengerV2Abi,
  usdcAbi,
} from "@usewhisk/cctp";
import type {
  CallReceipt,
  EvmAdapter,
  EvmCall,
  SendCallsResult,
} from "../../engine/adapter.js";

type Hex = `0x${string}`;

export type EvmBurn = {
  chainId: number;
  tokenMessenger: Hex;
  amount: bigint;
  destinationDomain: number;
  mintRecipient: Hex;
  burnToken: Hex;
  destinationCaller: Hex;
  maxFee: bigint;
  minFinalityThreshold: number;
  hookData?: Hex;
};

export type EvmTransfer = {
  chainId: number;
  token: Hex;
  to: Hex;
  amount: bigint;
};
export type EvmApproval = {
  chainId: number;
  token: Hex;
  spender: Hex;
  amount: bigint;
};
export type EvmMint = {
  chainId: number;
  messageTransmitter: Hex;
  message: Hex;
  attestation: Hex;
};

export type FakeEvmWallet = {
  adapter: EvmAdapter;
  readonly chainId: number;
  readonly switches: readonly number[];
  readonly batches: readonly EvmCall[][];
  readonly burns: readonly EvmBurn[];
  readonly transfers: readonly EvmTransfer[];
  readonly approvals: readonly EvmApproval[];
  readonly mints: readonly EvmMint[];
  fund(chainId: number, token: Hex, amount: bigint): void;
  balanceOf(chainId: number, token: Hex, holder?: Hex): bigint;
  /** The next call to `functionName` is mined but reverts and changes nothing. */
  revertNext(functionName: string): void;
};

const ABIS: readonly Abi[] = [
  usdcAbi,
  tokenMessengerV2Abi,
  messageTransmitterV2Abi,
];

export function createFakeEvmWallet(opts: {
  address?: Hex;
  chainId: number;
}): FakeEvmWallet {
  const address = getAddress(
    opts.address ?? "0x0000000000000000000000000000000000000010",
  );
  let chainId = opts.chainId;
  let hashCounter = 0;
  const switches: number[] = [];
  const batches: EvmCall[][] = [];
  const burns: EvmBurn[] = [];
  const transfers: EvmTransfer[] = [];
  const approvals: EvmApproval[] = [];
  const mints: EvmMint[] = [];
  const balances = new Map<string, bigint>();
  const allowances = new Map<string, bigint>();
  const receipts = new Map<Hex, CallReceipt["status"]>();
  const pendingReverts: string[] = [];

  const key = (...parts: (string | number)[]) =>
    parts.map((p) => String(p).toLowerCase()).join(":");
  const balance = (token: Hex, holder: Hex) =>
    balances.get(key(chainId, token, holder)) ?? 0n;
  const setBalance = (token: Hex, holder: Hex, value: bigint) =>
    balances.set(key(chainId, token, holder), value);

  function decode(call: EvmCall) {
    const selector = slice(call.data, 0, 4);
    const abi = ABIS.find((a) =>
      a.some(
        (item) =>
          item.type === "function" && toFunctionSelector(item) === selector,
      ),
    );
    if (!abi) {
      throw new Error(
        `fake evm: cannot decode call to ${call.to}: ${call.data}`,
      );
    }
    return decodeFunctionData({ abi, data: call.data });
  }

  // A reverted call changes no state.
  function apply(call: EvmCall): boolean {
    const { functionName, args = [] } = decode(call);
    const revertAt = pendingReverts.indexOf(functionName);
    if (revertAt !== -1) {
      pendingReverts.splice(revertAt, 1);
      return false;
    }
    switch (functionName) {
      case "approve": {
        const [spender, amount] = args as [Hex, bigint];
        allowances.set(key(chainId, call.to, address, spender), amount);
        approvals.push({ chainId, token: call.to, spender, amount });
        return true;
      }
      case "transfer": {
        const [to, amount] = args as [Hex, bigint];
        const from = balance(call.to, address);
        if (from < amount) return false;
        setBalance(call.to, address, from - amount);
        setBalance(call.to, to, balance(call.to, to) + amount);
        transfers.push({ chainId, token: call.to, to, amount });
        return true;
      }
      case "depositForBurn":
      case "depositForBurnWithHook": {
        const [
          amount,
          destinationDomain,
          mintRecipient,
          burnToken,
          destinationCaller,
          maxFee,
          minFinalityThreshold,
          hookData,
        ] = args as [bigint, number, Hex, Hex, Hex, bigint, number, Hex?];
        const allowanceKey = key(chainId, burnToken, address, call.to);
        const allowance = allowances.get(allowanceKey) ?? 0n;
        const from = balance(burnToken, address);
        if (allowance < amount || from < amount) return false;
        allowances.set(allowanceKey, allowance - amount);
        setBalance(burnToken, address, from - amount);
        burns.push({
          chainId,
          tokenMessenger: call.to,
          amount,
          destinationDomain,
          mintRecipient,
          burnToken,
          destinationCaller,
          maxFee,
          minFinalityThreshold,
          ...(hookData !== undefined && { hookData }),
        });
        return true;
      }
      case "receiveMessage": {
        const [message, attestation] = args as [Hex, Hex];
        mints.push({
          chainId,
          messageTransmitter: call.to,
          message,
          attestation,
        });
        return true;
      }
      default:
        throw new Error(`fake evm: ${functionName} is not modelled`);
    }
  }

  const adapter: EvmAdapter = {
    kind: "evm",
    address,
    async getChainId() {
      return chainId;
    },
    async switchChain(id) {
      switches.push(id);
      chainId = id;
    },
    async sendCalls(calls): Promise<SendCallsResult> {
      batches.push(calls);
      const hashes = calls.map((call) => {
        hashCounter += 1;
        const hash = `0x${hashCounter.toString(16).padStart(64, "0")}` as Hex;
        receipts.set(hash, apply(call) ? "success" : "reverted");
        return hash;
      });
      return { hashes };
    },
    async waitForReceipt(hash) {
      const status = receipts.get(hash);
      if (!status) throw new Error(`fake evm: unknown tx ${hash}`);
      return { status, blockNumber: 1n };
    },
  };

  return {
    adapter,
    get chainId() {
      return chainId;
    },
    switches,
    batches,
    burns,
    transfers,
    approvals,
    mints,
    fund(id, token, amount) {
      balances.set(
        key(id, token, address),
        (balances.get(key(id, token, address)) ?? 0n) + amount,
      );
    },
    balanceOf(id, token, holder = address) {
      return balances.get(key(id, token, holder)) ?? 0n;
    },
    revertNext(functionName) {
      pendingReverts.push(functionName);
    },
  };
}
