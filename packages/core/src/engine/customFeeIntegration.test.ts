import { beforeEach, describe, expect, it } from "vitest";
import { Keypair as StellarKeypair } from "@stellar/stellar-sdk";
import type { IrisMessage } from "@usewhisk/cctp";
import { Base, Solana, Starknet, Stellar } from "@usewhisk/cctp";
import type { Chain } from "../types/chain.js";
import type { WhiskConfig } from "../types/config.js";
import type { WhiskAdapter } from "./adapter.js";
import { createWhisk as createEngine } from "./createWhisk.js";
import { WHISK_TREASURY_ADDRESS } from "../fees/treasury.js";
import {
  createFakeEvmWallet,
  createFakeIris,
  createFakeSolanaWallet,
  createFakeStarknetWallet,
  createFakeStellarWallet,
  type DecodedEvmCall,
  type FakeEvmWallet,
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
});

const NONCE = `0x${"cd".repeat(32)}`;
const word = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");
const u32 = (n: number) => n.toString(16).padStart(8, "0");

function attested(destination: number): IrisMessage {
  const message = `0x${[
    u32(1),
    u32(Base.cctpDomain),
    u32(destination),
    word(NONCE),
    word("0x0"),
    word("0x0"),
    word("0x0"),
    u32(1000),
    u32(1000),
    u32(1),
    word("0x0"),
    word("0x0"),
    word(5_000_000n.toString(16)),
    word("0x0"),
    word("0x0"),
    word("0x0"),
    word("0x0"),
  ].join("")}` as `0x${string}`;
  return {
    message,
    attestation: `0x${"22".repeat(65)}`,
    eventNonce: NONCE,
    status: "complete",
    cctpVersion: 2,
    ...(destination === 3 && {
      forwardState: "COMPLETE",
      forwardTxHash: `0x${"ff".repeat(32)}`,
    }),
  };
}

type FeeRoute = {
  destination: Chain;
  recipient: string;
  destinationAdapter?: WhiskAdapter;
  message?: IrisMessage;
};

const ROUTES: Record<string, () => FeeRoute> = {
  "Base to Base": () => ({ destination: "Base", recipient: RECIPIENT }),
  "Base to Arbitrum": () => ({
    destination: "Arbitrum",
    recipient: RECIPIENT,
    message: attested(3),
  }),
  "Base to Solana": () => {
    const solana = createFakeSolanaWallet(Solana);
    return {
      destination: "Solana",
      recipient: solana.address,
      destinationAdapter: solana.adapter,
      message: attested(Solana.cctpDomain),
    };
  },
  "Base to Stellar": () => ({
    destination: "Stellar",
    recipient: StellarKeypair.random().publicKey(),
    destinationAdapter: createFakeStellarWallet(Stellar).adapter,
    message: attested(Stellar.cctpDomain),
  }),
  "Base to Starknet": () => ({
    destination: "Starknet",
    recipient: `0x04${"ab".repeat(31)}`,
    destinationAdapter: createFakeStarknetWallet(Starknet).adapter,
    message: attested(Starknet.cctpDomain),
  }),
};

const isMoneyMove = (call: DecodedEvmCall) =>
  call.functionName.startsWith("depositForBurn") ||
  (call.functionName === "transfer" &&
    String(call.args[0]).toLowerCase() === RECIPIENT.toLowerCase());

const movesMoney = (name: string) =>
  name === "Base to Base"
    ? "transfer"
    : name === "Base to Stellar"
      ? "depositForBurnWithHook"
      : "depositForBurnWithFees";

const isFee = (call: DecodedEvmCall) =>
  call.functionName === "transfer" && !isMoneyMove(call);

function feeTransfers(wallet: FakeEvmWallet) {
  return wallet.transfers.filter((t) =>
    [MERCHANT, WHISK_TREASURY_ADDRESS]
      .map((a) => a.toLowerCase())
      .includes(t.to.toLowerCase()),
  );
}

async function sendWithFee(
  name: string,
  setup: (wallet: FakeEvmWallet) => void = () => {},
  atomic?: "supported" | "refuses",
) {
  const route = (ROUTES[name] as () => FeeRoute)();
  const wallet = createFakeEvmWallet({
    chainId: Base.evmChainId,
    ...(atomic && { atomic }),
  });
  wallet.fund(Base.evmChainId, Base.usdc, 100_000_000n);
  const engine = createWhisk({
    chains: [...new Set<Chain>(["Base", route.destination])],
    feeBearer: "sender",
    feePolicy: { value: "1", recipient: MERCHANT },
  });
  const adapters = {
    adapter: wallet.adapter,
    ...(route.destinationAdapter && {
      destinationAdapter: route.destinationAdapter,
    }),
  };
  const quote = await engine.quote({
    sourceChain: "Base",
    destinationChain: route.destination,
    recipient: { address: route.recipient, chain: route.destination },
    amount: "5",
    ...adapters,
  });
  if (route.message) iris.replyToMessages({ message: route.message });
  setup(wallet);
  const result = await engine.send({ quote, ...adapters });
  return { wallet, result };
}

describe.each(Object.keys(ROUTES))(
  "%s: the merchant fee is only paid for money that moved",
  (name) => {
    it("sends no fee when the payer rejects the burn", async () => {
      const { wallet, result } = await sendWithFee(name, (w) =>
        w.rejectNext(isMoneyMove),
      );
      expect(result.kind).toBe("failure");
      expect(feeTransfers(wallet)).toEqual([]);
      expect(result.customFee).toEqual({ status: "unpaid", amount: "1" });
    });

    it("sends no fee when the burn reverts", async () => {
      const { wallet, result } = await sendWithFee(name, (w) =>
        w.revertNext(movesMoney(name)),
      );
      expect(result.kind).toBe("failure");
      expect(feeTransfers(wallet)).toEqual([]);
    });

    it("asks for the fee once the burn has landed, and reports it paid", async () => {
      const { wallet, result } = await sendWithFee(name);
      expect(result.kind).toBe("success");
      const [burn, merchant, treasury] = wallet.batches;
      expect(burn?.some((c) => c.data.startsWith("0xa9059cbb"))).toBe(
        name === "Base to Base",
      );
      expect(merchant).toHaveLength(1);
      expect(treasury).toHaveLength(1);
      expect(feeTransfers(wallet).map((t) => t.amount)).toEqual([
        900_000n,
        100_000n,
      ]);
      expect(result.customFee).toMatchObject({ status: "paid", amount: "1" });
      if (result.customFee?.status === "paid") {
        expect(result.customFee.txHashes).toHaveLength(2);
      }
    });

    it("finishes the transfer when the payer rejects the fee", async () => {
      const { wallet, result } = await sendWithFee(name, (w) =>
        w.rejectNext(isFee),
      );
      expect(result.kind).toBe("success");
      expect(feeTransfers(wallet)).toEqual([]);
      expect(result.customFee).toMatchObject({
        status: "unpaid",
        amount: "1",
        error: { category: "user_rejected" },
      });
      const moved = result.steps.find(
        (s) => s.name === "burn" || s.name === "transfer",
      );
      expect(moved).toMatchObject({ state: "success" });
      expect(moved?.txHash).toBeDefined();
    });

    it("sends the fee with the burn, after it, on a wallet that batches atomically", async () => {
      const { wallet, result } = await sendWithFee(name, () => {}, "supported");
      expect(result.kind).toBe("success");
      expect(wallet.batchOptions[0]?.atomic).toBe(true);
      const batch = wallet.batches[0] ?? [];
      expect(
        batch.slice(-2).every((c) => c.data.startsWith("0xa9059cbb")),
      ).toBe(true);
      expect(feeTransfers(wallet)).toHaveLength(2);
      expect(result.customFee).toMatchObject({ status: "paid", amount: "1" });
    });

    it("lands neither burn nor fee when an atomic batch reverts", async () => {
      const { wallet, result } = await sendWithFee(
        name,
        (w) => w.revertNext(movesMoney(name)),
        "supported",
      );
      expect(result.kind).toBe("failure");
      expect(feeTransfers(wallet)).toEqual([]);
      expect(result.customFee).toEqual({ status: "unpaid", amount: "1" });
    });

    it("falls back to a separate fee when the wallet refuses an atomic batch", async () => {
      const { wallet, result } = await sendWithFee(name, () => {}, "refuses");
      expect(result.kind).toBe("success");
      expect(wallet.batchOptions[0]?.atomic).toBe(true);
      expect(wallet.batchOptions.slice(1).some((o) => o?.atomic)).toBe(false);
      expect(feeTransfers(wallet)).toHaveLength(2);
      expect(result.customFee).toMatchObject({ status: "paid" });
    });
  },
);

it("reports the merchant share when the payer rejects the treasury share", async () => {
  const { wallet, result } = await sendWithFee("Base to Arbitrum", (w) =>
    w.rejectNext(
      (call) =>
        call.functionName === "transfer" &&
        String(call.args[0]).toLowerCase() ===
          WHISK_TREASURY_ADDRESS.toLowerCase(),
    ),
  );
  expect(result.kind).toBe("success");
  expect(feeTransfers(wallet).map((t) => t.amount)).toEqual([900_000n]);
  expect(result.customFee).toMatchObject({
    status: "unpaid",
    amount: "1",
    error: { category: "user_rejected" },
  });
  if (result.customFee?.status === "unpaid") {
    expect(result.customFee.txHashes).toHaveLength(1);
  }
});

it("reports a reverted fee as unpaid and still delivers", async () => {
  const { wallet, result } = await sendWithFee("Base to Arbitrum", (w) =>
    w.revertNext("transfer"),
  );
  expect(result.kind).toBe("success");
  expect(wallet.feeBurns).toHaveLength(1);
  expect(feeTransfers(wallet)).toEqual([]);
  expect(result.customFee).toMatchObject({
    status: "unpaid",
    amount: "1",
    error: { category: "reverted_onchain" },
  });
});

it("saves the burn hash from an atomic batch before any receipt wait", async () => {
  const route = (ROUTES["Base to Arbitrum"] as () => FeeRoute)();
  const wallet = createFakeEvmWallet({
    chainId: Base.evmChainId,
    atomic: "supported",
  });
  wallet.fund(Base.evmChainId, Base.usdc, 100_000_000n);
  const engine = createWhisk({
    chains: ["Base", "Arbitrum"],
    feePolicy: { value: "1", recipient: MERCHANT },
  });
  const quote = await engine.quote({
    sourceChain: "Base",
    destinationChain: "Arbitrum",
    recipient: { address: route.recipient, chain: "Arbitrum" },
    amount: "5",
    adapter: wallet.adapter,
  });
  iris.replyToMessages({ message: route.message as IrisMessage });
  const seen: string[] = [];
  const result = await engine.send(
    { quote, adapter: wallet.adapter },
    { onBurnSubmitted: (hash) => seen.push(hash) },
  );
  expect(result.kind).toBe("success");
  expect(wallet.batches).toHaveLength(1);
  const burn = result.steps.find((s) => s.name === "burn");
  expect(new Set(seen)).toEqual(new Set([burn?.txHash]));
  expect(result.customFee).toEqual({
    status: "paid",
    amount: "1",
    txHashes: [burn?.txHash],
  });
});

it("a transfer without a fee policy reports no customFee", async () => {
  const wallet = createFakeEvmWallet({ chainId: Base.evmChainId });
  wallet.fund(Base.evmChainId, Base.usdc, 100_000_000n);
  const engine = createWhisk({ chains: ["Base"] });
  const quote = await engine.quote({
    sourceChain: "Base",
    destinationChain: "Base",
    recipient: { address: RECIPIENT, chain: "Base" },
    amount: "5",
    adapter: wallet.adapter,
  });
  const result = await engine.send({ quote, adapter: wallet.adapter });
  expect(result.kind).toBe("success");
  expect(result.customFee).toBeUndefined();
  expect(wallet.batches).toHaveLength(1);
});
