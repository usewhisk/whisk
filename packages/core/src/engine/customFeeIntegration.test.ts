/**
 * End-to-end customFee wiring — verifies the engine surfaces the
 * merchant-fee entry in quotes and submits the extra USDC transfer in
 * sendCalls.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { IrisMessage } from "@usewhisk/cctp";
import { Base } from "@usewhisk/cctp";
import type { WhiskConfig } from "../types/config.js";
import { createWhisk as createEngine } from "./createWhisk.js";
import {
  createFakeEvmWallet,
  createFakeIris,
  type FakeIris,
} from "../test/harness/index.js";

const FORWARDED_MESSAGE: IrisMessage = {
  message: ("0x" + "11".repeat(32)) as `0x${string}`,
  attestation: ("0x" + "22".repeat(65)) as `0x${string}`,
  eventNonce: "1",
  status: "complete",
  cctpVersion: 2,
  forwardState: "COMPLETE",
  forwardTxHash: "0xff".padEnd(66, "f"),
};

const MERCHANT = "0x000000000000000000000000000000000000bEEF";
const RECIPIENT = "0x0000000000000000000000000000000000000020";

let iris: FakeIris;
beforeEach(() => {
  iris = createFakeIris();
  iris.replyToMessages({ message: FORWARDED_MESSAGE });
});

const createWhisk = (config: WhiskConfig) =>
  createEngine({ ...config, fetch: iris.fetch });

function makeAdapter() {
  const wallet = createFakeEvmWallet({ chainId: Base.evmChainId });
  wallet.fund(Base.evmChainId, Base.usdc, 100_000_000n);
  return { adapter: wallet.adapter, wallet };
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
    const { adapter, wallet } = makeAdapter();
    await engine.send({
      sourceChain: "Base",
      destinationChain: "Base",
      recipient: { address: RECIPIENT, chain: "Base" },
      amount: "10",
      adapter,
      // @ts-expect-error — quote not required by the executor for Send
      quote: {},
    });
    expect(wallet.batches).toHaveLength(1);
    const calls = wallet.batches[0] ?? [];
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
    const { adapter, wallet } = makeAdapter();
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
    const firstBatch = wallet.batches[0] ?? [];
    expect(firstBatch).toHaveLength(4);
    // The three USDC ops + the TokenMessenger burn.
    expect(firstBatch[0]?.to).toBe(Base.usdc);
    expect(firstBatch[1]?.to).toBe(Base.usdc);
    expect(firstBatch[2]?.to).toBe(Base.usdc);
    expect(firstBatch[3]?.to).toBe(Base.tokenMessenger);
  });
});
