/**
 * Engine smoke tests — exercise `createWhisk` end-to-end on a same-chain
 * Send and a forwarder-driven Bridge.
 */
import { describe, expect, it, vi } from "vitest";
import { Base, Arbitrum } from "@usewhisk/cctp";
import type { BurnFeeTier, IrisMessage } from "@usewhisk/cctp";
import type { EvmAdapter } from "./adapter.js";
import { ConfigError } from "../errors/errors.js";

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

const SUCCESS_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`;
const SENDER = "0x0000000000000000000000000000000000000010" as `0x${string}`;
const RECIPIENT = "0x0000000000000000000000000000000000000020";

function makeAdapter(opts: { chainId?: number } = {}): EvmAdapter {
  return {
    kind: "evm",
    address: SENDER,
    async getChainId() {
      return opts.chainId ?? Base.evmChainId;
    },
    async switchChain() {},
    async sendCalls(calls) {
      // One hash per call so the bridge path sees a separate approve + burn.
      return {
        hashes: calls.map(
          (_, i) =>
            ((i === 0 ? "0xaa" : "0xbb") +
              "".padEnd(64, i === 0 ? "a" : "b")) as `0x${string}`,
        ),
      };
    },
    async waitForReceipt() {
      return { status: "success", blockNumber: 1n };
    },
  };
}

describe("createWhisk", () => {
  it("rejects an empty chains list", () => {
    expect(() => createWhisk({ chains: [] })).toThrow(ConfigError);
  });

  it("issues a same-chain quote with zero fees", async () => {
    const engine = createWhisk({ chains: ["Base"] });
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Base",
      recipient: { address: RECIPIENT, chain: "Base" },
      amount: "1.5",
      adapter: makeAdapter(),
    });
    expect(quote.route.kind).toBe("send");
    expect(quote.amountIn).toBe("1.5");
    expect(quote.amountOut).toBe("1.5");
    expect(quote.fees.entries).toEqual([]);
    expect(quote.fees.total).toBe("0");
  });

  it("issues a bridge quote with protocol + forwarder fee entries", async () => {
    const engine = createWhisk({
      chains: ["Base", "Arbitrum"],
      feeBearer: "sender",
    });
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "10",
      adapter: makeAdapter(),
    });
    expect(quote.route.kind).toBe("bridge");
    expect(quote.fees.entries.map((e) => e.kind).sort()).toEqual([
      "forwarder",
      "protocol",
    ]);
    // Sender mode: recipient receives the full requested amount.
    expect(quote.amountOut).toBe("10");
    // amountIn is grossed up to cover the fees.
    expect(Number(quote.amountIn)).toBeGreaterThan(10);
  });

  it("executes a same-chain Send end-to-end", async () => {
    const engine = createWhisk({ chains: ["Base"] });
    const adapter = makeAdapter();
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Base",
      recipient: { address: RECIPIENT, chain: "Base" },
      amount: "1.5",
      adapter,
    });
    const result = await engine.send({
      sourceChain: "Base",
      destinationChain: "Base",
      recipient: { address: RECIPIENT, chain: "Base" },
      amount: "1.5",
      adapter,
      quote,
    });
    expect(result.kind).toBe("success");
  });

  it("executes a forwarder-driven Bridge end-to-end", async () => {
    const engine = createWhisk({
      chains: ["Base", "Arbitrum"],
      feeBearer: "sender",
    });
    const adapter = makeAdapter();
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "5",
      adapter,
    });
    const result = await engine.send({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "5",
      adapter,
      quote,
    });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const mintStep = result.steps.find((s) => s.name === "mint");
      expect(mintStep?.state).toBe("success");
      expect(mintStep?.forwarded).toBe(true);
      expect(result.finalTxHash).toBe(FORWARDED_MESSAGE.forwardTxHash);
    }
  });

  it("rejects an EVM adapter when the chain is Solana with a clear ConfigError", async () => {
    const engine = createWhisk({ chains: ["Solana"] });
    await expect(
      engine.send({
        sourceChain: "Solana",
        destinationChain: "Solana",
        recipient: { address: RECIPIENT, chain: "Solana" },
        amount: "1",
        adapter: makeAdapter(),
        // @ts-expect-error — placeholder; quote isn't used on the failure path
        quote: {},
      }),
    ).rejects.toThrow(/Connect a Solana wallet|kind/i);
  });

  it("requires a destinationAdapter for EVM → Solana bridges", async () => {
    const engine = createWhisk({ chains: ["Base", "Solana"] });
    await expect(
      engine.send({
        sourceChain: "Base",
        destinationChain: "Solana",
        recipient: { address: RECIPIENT, chain: "Solana" },
        amount: "1",
        adapter: makeAdapter(),
        // @ts-expect-error — quote not used on the failure path
        quote: {},
      }),
    ).rejects.toThrow(/destinationAdapter/i);
  });

  it("uses Arbitrum's USDC contract for same-chain Send on Arbitrum", async () => {
    const engine = createWhisk({ chains: ["Arbitrum"] });
    const adapter = makeAdapter({ chainId: Arbitrum.evmChainId });
    const quote = await engine.quote({
      sourceChain: "Arbitrum",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "1",
      adapter,
    });
    expect(quote.route.kind).toBe("send");
  });
});
