/**
 * End-to-end customFee wiring — verifies the engine surfaces the
 * merchant-fee entry in quotes and submits the extra USDC transfer in
 * sendCalls.
 */
import { describe, expect, it, vi } from "vitest";
import type { BurnFeeTier, IrisMessage } from "@usewhisk/cctp";
import { Base } from "@usewhisk/cctp";
import type { EvmAdapter, EvmCall } from "./adapter.js";

const FAST_TIER: BurnFeeTier = {
  finalityThreshold: 1000,
  minimumFee: 1.3,
  forwardFee: { low: 100_000, med: 250_000, high: 500_000 },
};

const FORWARDED_MESSAGE: IrisMessage = {
  message: ("0x" + "11".repeat(32)) as `0x${string}`,
  attestation: ("0x" + "22".repeat(65)) as `0x${string}`,
  eventNonce: "1",
  status: "complete",
  cctpVersion: 2,
  forwardState: "COMPLETE",
  forwardTxHash: "0xff".padEnd(66, "f"),
};

vi.mock("@usewhisk/cctp", async () => {
  const actual =
    await vi.importActual<typeof import("@usewhisk/cctp")>("@usewhisk/cctp");
  return {
    ...actual,
    getBurnFees: vi.fn(async () => [FAST_TIER]),
    pollMessages: vi.fn(async () => FORWARDED_MESSAGE),
  };
});

const { createWhisk } = await import("./createWhisk.js");

const MERCHANT = "0x000000000000000000000000000000000000bEEF";
const RECIPIENT = "0x0000000000000000000000000000000000000020";
const SENDER = "0x0000000000000000000000000000000000000010" as `0x${string}`;

function makeAdapter() {
  const sendCallsSpy = vi.fn(async (calls: EvmCall[]) => ({
    hashes: calls.map(
      (_, i) =>
        ((i === 0 ? "0xaa" : i === 1 ? "0xbb" : "0xcc") +
          "".padEnd(64, ["a", "b", "c"][i] ?? "d")) as `0x${string}`,
    ),
  }));
  const adapter: EvmAdapter = {
    kind: "evm",
    address: SENDER,
    async getChainId() {
      return Base.evmChainId;
    },
    async switchChain() {},
    sendCalls: sendCallsSpy,
    async waitForReceipt() {
      return { status: "success" as const, blockNumber: 1n };
    },
  };
  return { adapter, sendCallsSpy };
}

describe("customFee wiring", () => {
  it("same-chain quote splits the fee 90/10 and bumps amountIn by the full fee", async () => {
    const engine = createWhisk({
      chains: ["Base"],
      feePolicy: { value: "1", recipient: MERCHANT },
    });
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Base",
      recipient: { address: RECIPIENT, chain: "Base" },
      amount: "10",
      adapter: makeAdapter().adapter,
    });
    expect(quote.amountOut).toBe("10");
    // User pays amount + total fee (split is internal, not extra cost).
    expect(quote.amountIn).toBe("11");
    expect(quote.fees.entries.map((e) => e.kind)).toEqual(["custom", "custom"]);
    expect(quote.fees.entries[0]?.amount).toBe("0.9");
    expect(quote.fees.entries[1]?.amount).toBe("0.1");
  });

  it("same-chain Send prepends both merchant + treasury transfers to sendCalls", async () => {
    const engine = createWhisk({
      chains: ["Base"],
      feePolicy: { value: "1", recipient: MERCHANT },
    });
    const { adapter, sendCallsSpy } = makeAdapter();
    await engine.send({
      sourceChain: "Base",
      destinationChain: "Base",
      recipient: { address: RECIPIENT, chain: "Base" },
      amount: "10",
      adapter,
      // @ts-expect-error — quote not required by the executor for Send
      quote: {},
    });
    expect(sendCallsSpy).toHaveBeenCalledOnce();
    const calls = sendCallsSpy.mock.calls[0]?.[0] ?? [];
    // [merchant fee, treasury fee, main transfer]
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.to).toBe(Base.usdc);
      expect(call.data.startsWith("0xa9059cbb")).toBe(true);
    }
  });

  it("bridge quote includes both custom shares plus protocol + forwarder", async () => {
    const engine = createWhisk({
      chains: ["Base", "Arbitrum"],
      feeBearer: "sender",
      feePolicy: { value: "1", recipient: MERCHANT },
    });
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "25",
      adapter: makeAdapter().adapter,
    });
    const kinds = quote.fees.entries.map((e) => e.kind).sort();
    expect(kinds).toEqual(["custom", "custom", "forwarder", "protocol"]);
    expect(quote.amountOut).toBe("25");
    // amountIn = burnAmount (~25 + CCTP fees) + 1 USDC merchant fee.
    expect(Number(quote.amountIn)).toBeGreaterThan(26);
  });

  it("bridge Send prepends both customFee transfers ahead of approve+burn", async () => {
    const engine = createWhisk({
      chains: ["Base", "Arbitrum"],
      feeBearer: "sender",
      feePolicy: { value: "1", recipient: MERCHANT },
    });
    const { adapter, sendCallsSpy } = makeAdapter();
    await engine.send({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "5",
      adapter,
      // @ts-expect-error — bridge executor rebuilds the quote internally
      quote: {},
    });
    // First sendCalls invocation: [merchantFee, treasuryFee, approve, burn]
    const firstBatch = sendCallsSpy.mock.calls[0]?.[0] ?? [];
    expect(firstBatch).toHaveLength(4);
    // The three USDC ops + the TokenMessenger burn.
    expect(firstBatch[0]?.to).toBe(Base.usdc);
    expect(firstBatch[1]?.to).toBe(Base.usdc);
    expect(firstBatch[2]?.to).toBe(Base.usdc);
    expect(firstBatch[3]?.to).toBe(Base.tokenMessenger);
  });
});
