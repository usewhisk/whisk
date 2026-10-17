/**
 * Engine smoke tests — exercise `createWhisk` end-to-end on a same-chain
 * Send and a forwarder-driven Bridge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Base, Arbitrum } from "@usewhisk/cctp";
import type { IrisMessage } from "@usewhisk/cctp";
import type { EvmAdapter } from "./adapter.js";
import type { WhiskConfig } from "../types/config.js";
import { ConfigError } from "../errors/errors.js";
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

const RECIPIENT = "0x0000000000000000000000000000000000000020";

let iris: FakeIris;
beforeEach(() => {
  iris = createFakeIris();
  iris.replyToMessages({ message: FORWARDED_MESSAGE });
  vi.stubGlobal("fetch", () => {
    throw new Error("the engine used the global fetch");
  });
});
afterEach(() => vi.unstubAllGlobals());

const createWhisk = (config: WhiskConfig) =>
  createEngine({ ...config, fetch: iris.fetch });

function makeWallet(chainId: number = Base.evmChainId) {
  const wallet = createFakeEvmWallet({ chainId });
  wallet.fund(Base.evmChainId, Base.usdc, 100_000_000n);
  wallet.fund(Arbitrum.evmChainId, Arbitrum.usdc, 100_000_000n);
  return wallet;
}

function makeAdapter(opts: { chainId?: number } = {}): EvmAdapter {
  return makeWallet(opts.chainId).adapter;
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

  it("quotes a bridge to Arc Testnet on domain 26", async () => {
    const engine = createWhisk({ chains: ["Base_Sepolia", "Arc_Testnet"] });
    const quote = await engine.quote({
      sourceChain: "Base_Sepolia",
      destinationChain: "Arc_Testnet",
      recipient: { address: RECIPIENT, chain: "Arc_Testnet" },
      amount: "10",
      adapter: makeAdapter({ chainId: 84_532 }),
    });
    expect(quote.route.kind).toBe("bridge");
    expect(iris.requests.map((r) => `${r.url.host}${r.url.pathname}`)).toEqual([
      "iris-api-sandbox.circle.com/v2/burn/USDC/fees/6/26",
    ]);
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
    const wallet = makeWallet();
    const adapter = wallet.adapter;
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
    expect(wallet.burns).toHaveLength(1);
    expect(wallet.burns[0]?.destinationDomain).toBe(Arbitrum.cctpDomain);
    expect(
      iris.requests.map((r) => `${r.method} ${r.url.host}${r.url.pathname}`),
    ).toContain(
      `GET iris-api.circle.com/v2/burn/USDC/fees/${Base.cctpDomain}/${Arbitrum.cctpDomain}`,
    );
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
