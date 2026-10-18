import { describe, expect, it } from "vitest";
import { encodeFunctionData } from "viem";
import {
  Base,
  getBurnFees,
  getMessages,
  IrisHttpError,
  pollMessages,
  tokenMessengerV2Abi,
  usdcAbi,
  type IrisMessage,
} from "@usewhisk/cctp";
import { createFakeEvmWallet, createFakeIris } from "./index.js";

const MESSAGE: IrisMessage = {
  message: "0x11",
  attestation: "0x22",
  eventNonce: "7",
  status: "complete",
  cctpVersion: 2,
};
const PENDING: IrisMessage = { ...MESSAGE, status: "pending_confirmations" };
const PAYEE = "0x0000000000000000000000000000000000000020";
const ZERO32 = `0x${"00".repeat(32)}` as const;

describe("fake iris", () => {
  it("serves the fast and standard fee rows unless a pair is overridden", async () => {
    const iris = createFakeIris();
    const tiers = await getBurnFees("mainnet", 6, 3, { fetch: iris.fetch });
    expect(tiers.map((t) => t.finalityThreshold)).toEqual([1000, 2000]);

    iris.setFees(6, 3, [{ finalityThreshold: 2000, minimumFee: 0 }]);
    expect(await getBurnFees("mainnet", 6, 3, { fetch: iris.fetch })).toEqual([
      { finalityThreshold: 2000, minimumFee: 0n },
    ]);
  });

  it("answers 404 until a message is queued, then repeats the last reply", async () => {
    const iris = createFakeIris();
    const query = { sourceDomain: 6, transactionHash: "0xabc" } as const;
    const opts = { network: "testnet" as const, fetch: iris.fetch };
    expect(await getMessages(query, opts)).toEqual([]);

    iris.replyToMessages({ message: PENDING }, { message: MESSAGE });
    const done = await pollMessages(query, { ...opts, intervalMs: 1 });
    expect(done?.status).toBe("complete");
    expect((await getMessages(query, opts))[0]?.status).toBe("complete");
  });

  it("returns scripted HTTP errors such as a 429", async () => {
    const iris = createFakeIris();
    iris.replyToMessages({ status: 429 });
    await expect(
      getMessages(
        { sourceDomain: 6, transactionHash: "0xabc" },
        { network: "testnet", fetch: iris.fetch, maxRetries: 0 },
      ),
    ).rejects.toBeInstanceOf(IrisHttpError);
  });

  it("records the method and host of every request", async () => {
    const iris = createFakeIris();
    iris.replyToReattest({ message: MESSAGE });
    await getBurnFees("testnet", 6, 3, { fetch: iris.fetch });
    const reattested = await iris.fetch(
      "https://iris-api.circle.com/v2/reattest/9",
      { method: "POST" },
    );
    expect(reattested.status).toBe(200);
    expect(
      iris.requests.map((r) => `${r.method} ${r.url.host}${r.url.pathname}`),
    ).toEqual([
      "GET iris-api-sandbox.circle.com/v2/burn/USDC/fees/6/3",
      "POST iris-api.circle.com/v2/reattest/9",
    ]);
  });

  it("rejects hosts that are not Iris", async () => {
    const iris = createFakeIris();
    const res = await iris.fetch("https://example.com/v2/messages/0");
    expect(res.status).toBe(400);
  });
});

describe("fake evm wallet", () => {
  const transfer = (amount: bigint) => ({
    to: Base.usdc,
    data: encodeFunctionData({
      abi: usdcAbi,
      functionName: "transfer",
      args: [PAYEE, amount],
    }),
    value: 0n,
  });
  const approve = (amount: bigint) => ({
    to: Base.usdc,
    data: encodeFunctionData({
      abi: usdcAbi,
      functionName: "approve",
      args: [Base.tokenMessenger, amount],
    }),
    value: 0n,
  });
  const burn = (amount: bigint) => ({
    to: Base.tokenMessenger,
    data: encodeFunctionData({
      abi: tokenMessengerV2Abi,
      functionName: "depositForBurn",
      args: [amount, 3, ZERO32, Base.usdc, ZERO32, 0n, 1000],
    }),
    value: 0n,
  });

  it("moves bigint balances on a transfer", async () => {
    const wallet = createFakeEvmWallet({ chainId: Base.evmChainId });
    wallet.fund(Base.evmChainId, Base.usdc, 10n);
    const { hashes } = await wallet.adapter.sendCalls([transfer(4n)]);
    expect((await wallet.adapter.waitForReceipt(hashes[0]!)).status).toBe(
      "success",
    );
    expect(wallet.balanceOf(Base.evmChainId, Base.usdc)).toBe(6n);
    expect(wallet.balanceOf(Base.evmChainId, Base.usdc, PAYEE)).toBe(4n);
  });

  it("reverts a transfer larger than the balance", async () => {
    const wallet = createFakeEvmWallet({ chainId: Base.evmChainId });
    wallet.fund(Base.evmChainId, Base.usdc, 3n);
    const { hashes } = await wallet.adapter.sendCalls([transfer(4n)]);
    expect((await wallet.adapter.waitForReceipt(hashes[0]!)).status).toBe(
      "reverted",
    );
    expect(wallet.transfers).toEqual([]);
  });

  it("needs an allowance before a burn", async () => {
    const wallet = createFakeEvmWallet({ chainId: Base.evmChainId });
    wallet.fund(Base.evmChainId, Base.usdc, 10n);
    await wallet.adapter.sendCalls([burn(5n)]);
    expect(wallet.burns).toEqual([]);

    await wallet.adapter.sendCalls([approve(5n), burn(5n)]);
    expect(wallet.burns.map((b) => b.amount)).toEqual([5n]);
    expect(wallet.balanceOf(Base.evmChainId, Base.usdc)).toBe(5n);
  });

  it("reverts the next call to a named function once", async () => {
    const wallet = createFakeEvmWallet({ chainId: Base.evmChainId });
    wallet.revertNext("approve");
    const first = await wallet.adapter.sendCalls([approve(1n)]);
    const second = await wallet.adapter.sendCalls([approve(1n)]);
    expect((await wallet.adapter.waitForReceipt(first.hashes[0]!)).status).toBe(
      "reverted",
    );
    expect(
      (await wallet.adapter.waitForReceipt(second.hashes[0]!)).status,
    ).toBe("success");
  });
});
