import { describe, expect, it, vi } from "vitest";
import { Base } from "@usewhisk/cctp";
import type { EvmAdapter, EvmCall } from "../adapter.js";
import {
  InvalidAddressError,
  OnchainRevertError,
  UserRejectedError,
  WhiskError,
} from "../../errors/errors.js";
import type { Step } from "../../types/step.js";
import { executeSameChainSend } from "./sameChain.js";

type MockAdapterOptions = {
  chainId?: number;
  switchChain?: () => Promise<void>;
  sendCalls?: (calls: EvmCall[]) => Promise<{ hashes: `0x${string}`[] }>;
  waitForReceipt?: (
    hash: `0x${string}`,
  ) => Promise<{ status: "success" | "reverted"; blockNumber: bigint }>;
};

const SENDER = "0x0000000000000000000000000000000000000001" as `0x${string}`;
const RECIPIENT = "0x0000000000000000000000000000000000000002";
const SUCCESS_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;

function makeAdapter(opts: MockAdapterOptions = {}): EvmAdapter {
  return {
    kind: "evm",
    address: SENDER,
    async getChainId() {
      return opts.chainId ?? Base.evmChainId;
    },
    switchChain: opts.switchChain ?? (async () => {}),
    sendCalls: opts.sendCalls ?? (async () => ({ hashes: [SUCCESS_HASH] })),
    waitForReceipt:
      opts.waitForReceipt ??
      (async () => ({ status: "success", blockNumber: 100n })),
  };
}

describe("executeSameChainSend", () => {
  it("submits a USDC transfer and reports success", async () => {
    const sendCalls = vi.fn(async (_: EvmCall[]) => ({
      hashes: [SUCCESS_HASH],
    }));
    const adapter = makeAdapter({ sendCalls });

    const result = await executeSameChainSend({
      chain: Base,
      recipientAddress: RECIPIENT,
      amount: 5_000_000n,
      adapter,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.finalTxHash).toBe(SUCCESS_HASH);
      expect(result.steps).toEqual([
        { name: "approve", state: "noop" },
        { name: "transfer", state: "success", txHash: SUCCESS_HASH },
      ]);
    }

    // Verify the call targets USDC and encodes transfer(recipient, amount).
    expect(sendCalls).toHaveBeenCalledOnce();
    const [calls] = sendCalls.mock.calls[0] ?? [[]];
    expect(calls).toHaveLength(1);
    expect(calls[0]?.to).toBe(Base.usdc);
    expect(calls[0]?.value).toBe(0n);
    // ERC-20 transfer selector is 0xa9059cbb.
    expect(calls[0]?.data.startsWith("0xa9059cbb")).toBe(true);
  });

  it("emits step events as the transfer progresses", async () => {
    const events: Step[] = [];
    const adapter = makeAdapter();
    await executeSameChainSend(
      { chain: Base, recipientAddress: RECIPIENT, amount: 1_000_000n, adapter },
      { onStep: (s) => events.push(s) },
    );
    expect(events.map((e) => `${e.name}:${e.state}`)).toEqual([
      "transfer:pending",
      "transfer:success",
    ]);
    expect(events[0]?.txHash).toBe(SUCCESS_HASH);
  });

  it("switches chain when the wallet is on a different network", async () => {
    const switchChain = vi.fn(async () => {});
    const adapter = makeAdapter({
      chainId: 1, // wrong chain (Ethereum)
      switchChain,
    });
    const result = await executeSameChainSend({
      chain: Base,
      recipientAddress: RECIPIENT,
      amount: 1_000_000n,
      adapter,
    });
    expect(result.kind).toBe("success");
    expect(switchChain).toHaveBeenCalledWith(Base.evmChainId);
  });

  it("does not switch chain when the wallet is already on the right one", async () => {
    const switchChain = vi.fn(async () => {});
    const adapter = makeAdapter({
      chainId: Base.evmChainId,
      switchChain,
    });
    await executeSameChainSend({
      chain: Base,
      recipientAddress: RECIPIENT,
      amount: 1_000_000n,
      adapter,
    });
    expect(switchChain).not.toHaveBeenCalled();
  });

  it("returns InvalidAddressError without prompting the wallet", async () => {
    const sendCalls = vi.fn(async () => ({ hashes: [SUCCESS_HASH] }));
    const adapter = makeAdapter({ sendCalls });
    const result = await executeSameChainSend({
      chain: Base,
      recipientAddress: "not-an-address",
      amount: 1_000_000n,
      adapter,
    });
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.error).toBeInstanceOf(InvalidAddressError);
      expect(result.steps[1]?.state).toBe("error");
    }
    expect(sendCalls).not.toHaveBeenCalled();
  });

  it("maps user rejection from the wallet into UserRejectedError", async () => {
    const adapter = makeAdapter({
      sendCalls: async () => {
        throw new Error("User rejected the request");
      },
    });
    const result = await executeSameChainSend({
      chain: Base,
      recipientAddress: RECIPIENT,
      amount: 1_000_000n,
      adapter,
    });
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.error).toBeInstanceOf(UserRejectedError);
    }
  });

  it("maps an on-chain revert receipt into OnchainRevertError", async () => {
    const adapter = makeAdapter({
      waitForReceipt: async () => ({ status: "reverted", blockNumber: 1n }),
    });
    const result = await executeSameChainSend({
      chain: Base,
      recipientAddress: RECIPIENT,
      amount: 1_000_000n,
      adapter,
    });
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.error).toBeInstanceOf(OnchainRevertError);
      expect(result.steps[1]?.txHash).toBe(SUCCESS_HASH);
    }
  });

  it("fails cleanly when the adapter returns no hashes", async () => {
    const adapter = makeAdapter({
      sendCalls: async () => ({ hashes: [] }),
    });
    const result = await executeSameChainSend({
      chain: Base,
      recipientAddress: RECIPIENT,
      amount: 1_000_000n,
      adapter,
    });
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.error).toBeInstanceOf(WhiskError);
    }
  });
});
