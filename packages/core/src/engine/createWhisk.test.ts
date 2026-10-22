import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import { Keypair as StellarKeypair, scValToNative } from "@stellar/stellar-sdk";
import {
  ArcTestnet,
  Arbitrum,
  Base,
  BaseSepolia,
  Ethereum,
  Morph,
} from "@usewhisk/cctp";
import type { IrisMessage, StellarInvocation } from "@usewhisk/cctp";
import type { EvmAdapter, SolanaAdapter, StellarAdapter } from "./adapter.js";
import type { WhiskConfig } from "../types/config.js";
import { ConfigError } from "../errors/errors.js";
import { createWhisk as createEngine } from "./createWhisk.js";
import {
  createFakeEvmWallet,
  createFakeIris,
  FAST_FEE_ROW,
  STANDARD_FEE_ROW,
  type FakeIris,
} from "../test/harness/index.js";
import { parseUsdcAmount } from "./amount.js";

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
const SOLANA_RECIPIENT = "11111111111111111111111111111112";

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
      "iris-api-sandbox.circle.com/v2/fastBurn/USDC/allowance",
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
    expect(wallet.feeBurns).toHaveLength(1);
    expect(wallet.feeBurns[0]?.destinationDomain).toBe(Arbitrum.cctpDomain);
    expect(
      iris.requests.map((r) => `${r.method} ${r.url.host}${r.url.pathname}`),
    ).toContain(
      `POST iris-api.circle.com/v2/quote/burn/usdc/${Base.cctpDomain}/${Arbitrum.cctpDomain}`,
    );
  });

  it("rejects an EVM adapter when the chain is Solana with a clear ConfigError", async () => {
    const engine = createWhisk({ chains: ["Solana"] });
    const adapter = makeAdapter();
    const quote = await engine.quote({
      sourceChain: "Solana",
      destinationChain: "Solana",
      recipient: { address: SOLANA_RECIPIENT, chain: "Solana" },
      amount: "1",
      adapter,
    });
    await expect(engine.send({ adapter, quote })).rejects.toThrow(
      /Connect a Solana wallet|kind/i,
    );
  });

  it("requires a destinationAdapter for EVM → Solana bridges", async () => {
    const engine = createWhisk({ chains: ["Base", "Solana"] });
    const adapter = makeAdapter();
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Solana",
      recipient: { address: SOLANA_RECIPIENT, chain: "Solana" },
      amount: "5",
      adapter,
      destinationAdapter: makeSolanaAdapter().adapter,
    });
    await expect(engine.send({ adapter, quote })).rejects.toMatchObject({
      code: "ROUTE_UNAVAILABLE",
      reason: "destination_adapter_required",
      ecosystem: "solana",
    });
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

function makeSolanaAdapter() {
  const sent: unknown[] = [];
  const adapter: SolanaAdapter = {
    kind: "solana",
    address: Keypair.generate().publicKey.toBase58(),
    async getCluster() {
      return "mainnet-beta";
    },
    async sendTransaction(instructions) {
      sent.push(instructions);
      return { signature: "5".repeat(88) };
    },
    async confirmTransaction() {
      return { status: "success" as const, slot: 0n };
    },
    async getAccountInfo() {
      return null;
    },
  };
  return { adapter, sent };
}

describe("route planning", () => {
  it("#62 takes the network from the source chain when the config lists both", async () => {
    const engine = createWhisk({
      chains: ["Base", "Arbitrum", "Arc_Testnet"],
    });
    await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "10",
      adapter: makeAdapter(),
    });
    expect(new Set(iris.requests.map((r) => r.url.host))).toEqual(
      new Set(["iris-api.circle.com"]),
    );
  });

  it("refuses a transfer between mainnet and testnet before calling Iris", async () => {
    const engine = createWhisk({ chains: ["Base", "Arc_Testnet"] });
    await expect(
      engine.quote({
        sourceChain: "Base",
        destinationChain: "Arc_Testnet",
        recipient: { address: RECIPIENT, chain: "Arc_Testnet" },
        amount: "10",
        adapter: makeAdapter(),
      }),
    ).rejects.toMatchObject({ code: "NETWORK_MISMATCH" });
    expect(iris.requests).toEqual([]);
  });

  it("#63 refuses Solana to EVM without forwarding before the burn when no EVM wallet is connected", async () => {
    const engine = createWhisk({
      chains: ["Solana", "Base"],
      useForwarder: false,
    });
    const solana = makeSolanaAdapter();
    const quote = await engine.quote({
      sourceChain: "Solana",
      destinationChain: "Base",
      recipient: { address: RECIPIENT, chain: "Base" },
      amount: "5",
      adapter: solana.adapter,
      destinationAdapter: makeAdapter(),
    });
    await expect(
      engine.send({ adapter: solana.adapter, quote }),
    ).rejects.toMatchObject({
      code: "ROUTE_UNAVAILABLE",
      reason: "destination_adapter_required",
      ecosystem: "evm",
    });
    expect(solana.sent).toHaveLength(0);
  });

  it("#63 mints Solana to EVM with the EVM wallet when forwarding is off", async () => {
    iris.replyToMessages({
      message: {
        message: FORWARDED_MESSAGE.message,
        attestation: FORWARDED_MESSAGE.attestation,
        eventNonce: "1",
        status: "complete",
        cctpVersion: 2,
      },
    });
    const engine = createWhisk({
      chains: ["Solana", "Base"],
      useForwarder: false,
    });
    const solana = makeSolanaAdapter();
    const evm = makeWallet(Arbitrum.evmChainId);
    const params = {
      sourceChain: "Solana",
      destinationChain: "Base",
      recipient: { address: RECIPIENT, chain: "Base" },
      amount: "1",
      adapter: solana.adapter,
      destinationAdapter: evm.adapter,
    } as const;
    const quote = await engine.quote(params);
    const result = await engine.send({ ...params, quote });

    expect(result.kind).toBe("success");
    expect(solana.sent).toHaveLength(1);
    expect(evm.mints).toEqual([
      {
        chainId: Base.evmChainId,
        messageTransmitter: Base.messageTransmitter,
        message: FORWARDED_MESSAGE.message,
        attestation: FORWARDED_MESSAGE.attestation,
      },
    ]);
    if (result.kind === "success") {
      const mint = result.steps.find((s) => s.name === "mint");
      expect(mint).toMatchObject({ state: "success", forwarded: false });
    }
  });

  it("asks for the destination wallet at quote time", async () => {
    const engine = createWhisk({ chains: ["Base", "Solana"] });
    await expect(
      engine.quote({
        sourceChain: "Base",
        destinationChain: "Solana",
        recipient: {
          address: Keypair.generate().publicKey.toBase58(),
          chain: "Solana",
        },
        amount: "1",
        adapter: makeAdapter(),
      }),
    ).rejects.toMatchObject({
      code: "ROUTE_UNAVAILABLE",
      reason: "destination_adapter_required",
      ecosystem: "solana",
    });
    expect(iris.requests).toEqual([]);
  });

  it("mints with the payer's wallet when Circle does not forward to the destination", async () => {
    iris.replyToMessages({
      message: {
        message: FORWARDED_MESSAGE.message,
        attestation: FORWARDED_MESSAGE.attestation,
        eventNonce: "1",
        status: "complete",
        cctpVersion: 2,
      },
    });
    const engine = createWhisk({ chains: ["Base", "Morph"] });
    const wallet = makeWallet();
    const params = {
      sourceChain: "Base",
      destinationChain: "Morph",
      recipient: { address: RECIPIENT, chain: "Morph" },
      amount: "5",
      adapter: wallet.adapter,
    } as const;
    const quote = await engine.quote(params);
    const result = await engine.send({ ...params, quote });

    expect(result.kind).toBe("success");
    // Without a FORWARD fee, TokenMessengerWithFees adds no forwarding hook.
    expect(wallet.feeBurns).toHaveLength(1);
    expect(iris.quoteRequests[0]?.body.requests).toEqual([
      { type: "PRE_FINALITY" },
    ]);
    expect(quote.fees.entries.map((e) => e.kind)).not.toContain("forwarder");
    expect(wallet.mints.map((m) => m.chainId)).toEqual([Morph.evmChainId]);
  });
});

const UNFORWARDED_MESSAGE: IrisMessage = {
  message: FORWARDED_MESSAGE.message,
  attestation: FORWARDED_MESSAGE.attestation,
  eventNonce: "1",
  status: "complete",
  cctpVersion: 2,
};

describe("Standard-only sources", () => {
  it("#91 bridges from Arc as a Standard transfer", async () => {
    const engine = createWhisk({ chains: ["Arc_Testnet", "Base_Sepolia"] });
    const wallet = createFakeEvmWallet({ chainId: ArcTestnet.evmChainId });
    wallet.fund(ArcTestnet.evmChainId, ArcTestnet.usdc, 100_000_000n);
    const params = {
      sourceChain: "Arc_Testnet",
      destinationChain: "Base_Sepolia",
      recipient: { address: RECIPIENT, chain: "Base_Sepolia" },
      amount: "5",
      adapter: wallet.adapter,
    } as const;
    const quote = await engine.quote(params);
    expect(quote.plan?.speed).toBe("standard");
    expect(quote.plan?.etaSeconds).toEqual({ min: 0.5, max: 0.5 });
    expect(quote.fees.entries.map((e) => e.kind)).toEqual(["forwarder"]);

    const result = await engine.send({ ...params, quote });
    expect(result.kind).toBe("success");
    // Standard upfront: no PRE_FINALITY fee, so the contract burns at 2000.
    expect(wallet.feeBurns).toHaveLength(1);
    expect(iris.quoteRequests[0]?.body.requests).toEqual([{ type: "FORWARD" }]);
    expect(wallet.feeBurns[0]?.destinationDomain).toBe(BaseSepolia.cctpDomain);
    expect(
      iris.requests.map((r) => `${r.url.host}${r.url.pathname}`),
    ).toContain(
      `iris-api-sandbox.circle.com/v2/burn/USDC/fees/${ArcTestnet.cctpDomain}/${BaseSepolia.cctpDomain}`,
    );
  });

  it("#91 burns from Stellar with the Standard threshold", async () => {
    iris.replyToMessages({ message: UNFORWARDED_MESSAGE });
    const engine = createWhisk({
      chains: ["Stellar_Testnet", "Base_Sepolia"],
    });
    const invocations: StellarInvocation[] = [];
    const stellar: StellarAdapter = {
      kind: "stellar",
      address: StellarKeypair.random().publicKey(),
      async getNetwork() {
        return "testnet";
      },
      async submitInvocation(batch) {
        invocations.push(...batch);
        return { hashes: batch.map((_, i) => `${i}`.padStart(64, "a")) };
      },
      async confirmTransaction() {
        return { status: "success" as const, ledger: 1 };
      },
      async getLatestLedger() {
        return 1;
      },
    };
    const evm = createFakeEvmWallet({ chainId: BaseSepolia.evmChainId });
    const params = {
      sourceChain: "Stellar_Testnet",
      destinationChain: "Base_Sepolia",
      recipient: { address: RECIPIENT, chain: "Base_Sepolia" },
      amount: "5",
      adapter: stellar,
      destinationAdapter: evm.adapter,
    } as const;
    const quote = await engine.quote(params);
    expect(quote.plan?.speed).toBe("standard");

    const result = await engine.send({ ...params, quote });
    expect(result.kind).toBe("success");
    const burn = invocations.find((i) => i.functionName === "deposit_for_burn");
    expect(scValToNative(burn!.args[7]!)).toBe(2000);
    expect(evm.mints.map((m) => m.chainId)).toEqual([BaseSepolia.evmChainId]);
  });
});

describe("bound quotes", () => {
  const params = (adapter: EvmAdapter, amount = "5") =>
    ({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount,
      adapter,
    }) as const;
  const feeEntry = (
    q: { fees: { entries: { kind: string; amount: string }[] } },
    kind: string,
  ) => q.fees.entries.find((e) => e.kind === kind)?.amount;

  afterEach(() => vi.useRealTimers());

  it("#87 burns with the maxFee and amount of the quote the payer saw", async () => {
    // Receiver-pays keeps Base on the maxFee path, where #87 lived.
    const engine = createWhisk({
      chains: ["Base", "Arbitrum"],
      feeBearer: "receiver",
    });
    const wallet = makeWallet();
    const quote = await engine.quote(params(wallet.adapter));

    iris.setFees(Base.cctpDomain, Arbitrum.cctpDomain, [
      { ...FAST_FEE_ROW, minimumFee: 1.4 },
      STANDARD_FEE_ROW,
    ]);
    const result = await engine.send({ ...params(wallet.adapter), quote });

    expect(result.kind).toBe("success");
    expect(wallet.burns).toHaveLength(1);
    expect(wallet.burns[0]?.maxFee).toBe(parseUsdcAmount(quote.fees.total));
    expect(wallet.burns[0]?.amount).toBe(
      parseUsdcAmount(quote.amountBurned ?? ""),
    );
  });

  it("refuses a quote older than 60 seconds before any call", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const wallet = makeWallet();
    const quote = await engine.quote(params(wallet.adapter));

    vi.setSystemTime(Date.now() + 60_001);
    await expect(
      engine.send({ ...params(wallet.adapter), quote }),
    ).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
    expect(wallet.batches).toEqual([]);
  });

  it("asks again when fees rise past the quote, without signing", async () => {
    const engine = createWhisk({
      chains: ["Base", "Arbitrum"],
      feeBearer: "receiver",
    });
    const wallet = makeWallet();
    const quote = await engine.quote(params(wallet.adapter));

    iris.setFees(Base.cctpDomain, Arbitrum.cctpDomain, [
      {
        ...FAST_FEE_ROW,
        minimumFee: 5,
        forwardFee: { low: 550_000, med: 600_000, high: 700_000 },
      },
      STANDARD_FEE_ROW,
    ]);
    const sent = engine.send({ ...params(wallet.adapter), quote });
    await expect(sent).rejects.toMatchObject({ code: "QUOTE_CHANGED" });
    const error = await sent.catch((e: unknown) => e);
    const fresh = (error as { quote: typeof quote }).quote;
    expect(parseUsdcAmount(fresh.fees.total)).toBeGreaterThan(
      parseUsdcAmount(quote.fees.total),
    );
    expect(wallet.batches).toEqual([]);
  });

  it("buffers the Fast fee by 10% and forwards at the high level", async () => {
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const quote = await engine.quote(params(makeAdapter(), "10"));
    const burned = parseUsdcAmount(quote.amountBurned ?? "");
    const burnFee = (burned * 130n + 999_999n) / 1_000_000n;
    const buffered = (burnFee * 11n + 9n) / 10n;

    expect(feeEntry(quote, "forwarder")).toBe("0.5");
    expect(parseUsdcAmount(feeEntry(quote, "protocol") ?? "")).toBe(buffered);
    expect(quote.amountOut).toBe("10");
  });

  it("forwards into Ethereum at the med level unless the config says high", async () => {
    const toEthereum = {
      sourceChain: "Base",
      destinationChain: "Ethereum",
      recipient: { address: RECIPIENT, chain: "Ethereum" },
      amount: "10",
      adapter: makeAdapter(),
    } as const;
    const byDefault = await createWhisk({ chains: ["Base", "Ethereum"] }).quote(
      toEthereum,
    );
    expect(feeEntry(byDefault, "forwarder")).toBe("0.25");

    const high = await createWhisk({
      chains: ["Base", "Ethereum"],
      forwarderFeeLevel: "high",
    }).quote(toEthereum);
    expect(feeEntry(high, "forwarder")).toBe("0.5");
    expect(Ethereum.cctpDomain).toBe(0);
  });

  it("charges the on-chain minimum on a Standard burn from a fee-switch chain", async () => {
    iris.setStandardMinFee(7n);
    const engine = createWhisk({ chains: ["Arc_Testnet", "Base_Sepolia"] });
    const wallet = createFakeEvmWallet({ chainId: ArcTestnet.evmChainId });
    wallet.fund(ArcTestnet.evmChainId, ArcTestnet.usdc, 100_000_000n);
    const arcParams = {
      sourceChain: "Arc_Testnet",
      destinationChain: "Base_Sepolia",
      recipient: { address: RECIPIENT, chain: "Base_Sepolia" },
      amount: "5",
      adapter: wallet.adapter,
    } as const;
    const quote = await engine.quote(arcParams);
    expect(feeEntry(quote, "protocol")).toBe("0.000007");
    expect(
      iris.requests.some((r) =>
        r.url.href.startsWith(ArcTestnet.defaultRpcUrls[0]!),
      ),
    ).toBe(true);

    await engine.send({ ...arcParams, quote });
    expect(wallet.burns[0]?.maxFee).toBe(parseUsdcAmount(quote.fees.total));
  });
});

describe("signed quotes", () => {
  const TMWF_MAINNET = "0x71f54F818671cD0D7ea140Da213e5C8b5C92a408";
  const toArbitrum = (adapter: EvmAdapter) =>
    ({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "5",
      adapter,
    }) as const;

  it("pays Circle's fee upfront so the recipient gets exactly the amount", async () => {
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const wallet = makeWallet();
    const quote = await engine.quote(toArbitrum(wallet.adapter));

    // Shown: 650 at 1.3 bps plus 10%, and forwarding at `high`.
    expect(quote.feeMode).toBe("upfront");
    expect(quote.amountOut).toBe("5");
    expect(quote.amountBurned).toBe("5");
    expect(quote.subunits.maxFee).toBe(715n + 500_000n);
    expect(quote.amountIn).toBe("5.500715");

    const result = await engine.send({ adapter: wallet.adapter, quote });
    expect(result.kind).toBe("success");
    expect(iris.quoteRequests).toEqual([
      {
        sourceDomain: Base.cctpDomain,
        destinationDomain: Arbitrum.cctpDomain,
        body: {
          amount: "5000000",
          feeToken: Base.usdc,
          requests: [{ type: "FORWARD" }, { type: "PRE_FINALITY" }],
        },
      },
    ]);
    expect(wallet.burns).toEqual([]);
    expect(wallet.feeBurns).toHaveLength(1);
    expect(wallet.feeBurns[0]).toMatchObject({
      tokenMessengerWithFees: TMWF_MAINNET,
      amount: 5_000_000n,
      fee: 650n + 250_000n,
      destinationDomain: Arbitrum.cctpDomain,
      refundAddress: wallet.adapter.address,
    });
    expect(wallet.approvals.at(-1)).toMatchObject({
      spender: TMWF_MAINNET,
      amount: 5_000_000n + 715n + 500_000n,
    });
  });

  it("asks again when Circle's signed fee is above the shown fee", async () => {
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const wallet = makeWallet();
    const quote = await engine.quote(toArbitrum(wallet.adapter));

    iris.replyToQuote({ fee: 600_000n });
    await expect(
      engine.send({ adapter: wallet.adapter, quote }),
    ).rejects.toMatchObject({ code: "QUOTE_CHANGED" });
    expect(wallet.batches).toEqual([]);
  });

  it("fetches the signed quote once more when it has expired before submitting", async () => {
    iris.setBlockNumber(200);
    iris.replyToQuote({ expiresAtBlock: 150 }, {});
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const wallet = makeWallet();
    const quote = await engine.quote(toArbitrum(wallet.adapter));

    const result = await engine.send({ adapter: wallet.adapter, quote });
    expect(result.kind).toBe("success");
    expect(iris.quoteRequests).toHaveLength(2);
    expect(wallet.feeBurns).toHaveLength(1);
  });

  it("refuses when the second signed quote has expired too", async () => {
    iris.setBlockNumber(200);
    iris.replyToQuote({ expiresAtBlock: 150 });
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const wallet = makeWallet();
    const quote = await engine.quote(toArbitrum(wallet.adapter));

    await expect(
      engine.send({ adapter: wallet.adapter, quote }),
    ).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
    expect(iris.quoteRequests).toHaveLength(2);
    expect(wallet.batches).toEqual([]);
  });

  it("keeps receiver-pays transfers on maxFee", async () => {
    const engine = createWhisk({
      chains: ["Base", "Arbitrum"],
      feeBearer: "receiver",
    });
    const wallet = makeWallet();
    const quote = await engine.quote(toArbitrum(wallet.adapter));
    expect(quote.feeMode).toBe("maxFee");

    await engine.send({ adapter: wallet.adapter, quote });
    expect(iris.quoteRequests).toEqual([]);
    expect(wallet.burns).toHaveLength(1);
  });

  it("keeps Stellar destinations on maxFee", async () => {
    const engine = createWhisk({ chains: ["Base", "Stellar"] });
    const stellar: StellarAdapter = {
      kind: "stellar",
      address: StellarKeypair.random().publicKey(),
      async getNetwork() {
        return "public";
      },
      async submitInvocation(batch) {
        return { hashes: batch.map((_, i) => `${i}`.padStart(64, "a")) };
      },
      async confirmTransaction() {
        return { status: "success" as const, ledger: 1 };
      },
      async getLatestLedger() {
        return 1;
      },
    };
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Stellar",
      recipient: { address: stellar.address, chain: "Stellar" },
      amount: "5",
      adapter: makeAdapter(),
      destinationAdapter: stellar,
    });
    expect(quote.feeMode).toBe("maxFee");
  });

  it("plans a Fast route as Standard when Circle's Fast allowance is below the amount", async () => {
    iris.setFastAllowance(1_000_000n);
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const wallet = makeWallet();
    const quote = await engine.quote(toArbitrum(wallet.adapter));
    expect(quote.plan?.speed).toBe("standard");

    await engine.send({ adapter: wallet.adapter, quote });
    expect(iris.quoteRequests[0]?.body.requests).toEqual([{ type: "FORWARD" }]);
  });

  it("pays only the forwarding fee upfront from a Standard source", async () => {
    const engine = createWhisk({ chains: ["Arc_Testnet", "Base_Sepolia"] });
    const wallet = createFakeEvmWallet({ chainId: ArcTestnet.evmChainId });
    wallet.fund(ArcTestnet.evmChainId, ArcTestnet.usdc, 100_000_000n);
    const quote = await engine.quote({
      sourceChain: "Arc_Testnet",
      destinationChain: "Base_Sepolia",
      recipient: { address: RECIPIENT, chain: "Base_Sepolia" },
      amount: "5",
      adapter: wallet.adapter,
    });
    expect(quote.feeMode).toBe("upfront");
    expect(quote.amountOut).toBe("5");

    await engine.send({ adapter: wallet.adapter, quote });
    expect(iris.quoteRequests[0]?.body.requests).toEqual([{ type: "FORWARD" }]);
    expect(wallet.feeBurns[0]?.amount).toBe(5_000_000n);
  });

  it("stays on maxFee when a fee-switch chain charges a Standard minimum", async () => {
    iris.setStandardMinFee(7n);
    const engine = createWhisk({ chains: ["Arc_Testnet", "Base_Sepolia"] });
    const quote = await engine.quote({
      sourceChain: "Arc_Testnet",
      destinationChain: "Base_Sepolia",
      recipient: { address: RECIPIENT, chain: "Base_Sepolia" },
      amount: "5",
      adapter: createFakeEvmWallet({ chainId: ArcTestnet.evmChainId }).adapter,
    });
    expect(quote.feeMode).toBe("maxFee");
  });
});

describe("attestation polling", () => {
  it("reports a relayed mint done once Iris shows it confirmed with its tx hash", async () => {
    iris.replyToMessages({
      message: { ...FORWARDED_MESSAGE, forwardState: "CONFIRMED" },
    });
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const wallet = makeWallet();
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "5",
      adapter: wallet.adapter,
    });

    const result = await engine.send({ adapter: wallet.adapter, quote });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.finalTxHash).toBe(FORWARDED_MESSAGE.forwardTxHash);
    }
  });
});
