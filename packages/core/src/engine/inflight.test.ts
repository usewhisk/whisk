import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Arbitrum, Base, Morph, type IrisMessage } from "@usewhisk/cctp";
import type { EvmAdapter } from "./adapter.js";
import type { WhiskConfig } from "../types/config.js";
import { UserRejectedError } from "../errors/errors.js";
import {
  createMemoryInflightStore,
  createStorageInflightStore,
  type InflightRecord,
  type InflightStore,
} from "../inflight/index.js";
import { createWhisk as createEngine } from "./createWhisk.js";
import {
  createFakeEvmWallet,
  createFakeIris,
  type FakeEvmWallet,
  type FakeIris,
} from "../test/harness/index.js";

const RECIPIENT = "0x0000000000000000000000000000000000000020";
const NONCE = `0x${"ab".repeat(32)}` as const;
const FORWARD_HOOK = `0x636374702d666f7277617264${"00".repeat(20)}` as const;

function message(
  destinationDomain: number,
  overrides: Partial<IrisMessage> = {},
  expirationBlock = "0",
  hookData: `0x${string}` | null = null,
): IrisMessage {
  return {
    message: `0x${"11".repeat(32)}`,
    attestation: `0x${"22".repeat(65)}`,
    eventNonce: NONCE,
    status: "complete",
    cctpVersion: 2,
    decodedMessage: {
      sourceDomain: String(Base.cctpDomain),
      destinationDomain: String(destinationDomain),
      nonce: NONCE,
      sender: null,
      recipient: null,
      destinationCaller: null,
      minFinalityThreshold: "1000",
      finalityThresholdExecuted: "1000",
      messageBody: "0x",
      decodedMessageBody: {
        burnToken: Base.usdc,
        mintRecipient: RECIPIENT,
        amount: "5000000",
        messageSender: null,
        maxFee: "0",
        feeExecuted: "0",
        expirationBlock,
        hookData,
      },
    },
    ...overrides,
  };
}

const FORWARDED = message(
  Arbitrum.cctpDomain,
  { forwardState: "COMPLETE", forwardTxHash: `0x${"ff".repeat(32)}` },
  "0",
  FORWARD_HOOK,
);

let iris: FakeIris;
let store: InflightStore;
let wallet: FakeEvmWallet;

beforeEach(() => {
  iris = createFakeIris();
  store = createMemoryInflightStore();
  wallet = createFakeEvmWallet({ chainId: Base.evmChainId });
  wallet.fund(Base.evmChainId, Base.usdc, 100_000_000n);
  vi.stubGlobal("fetch", () => {
    throw new Error("the engine used the global fetch");
  });
});
afterEach(() => vi.unstubAllGlobals());

const createWhisk = (config: WhiskConfig) =>
  createEngine({ ...config, fetch: iris.fetch, inflightStore: store });

async function sendThenLoseTheTab(destination: "Arbitrum" | "Morph") {
  const engine = createWhisk({ chains: ["Base", destination] });
  const quote = await engine.quote({
    sourceChain: "Base",
    destinationChain: destination,
    recipient: { address: RECIPIENT, chain: destination },
    amount: "5",
    adapter: wallet.adapter,
  });
  // The wallet broadcasts approve and burn, then the receipt wait dies.
  wallet.dropNextReceipt();
  const result = await engine.send({ adapter: wallet.adapter, quote });
  expect(result.kind).toBe("failure");
  const records = await engine.inflight();
  expect(records).toHaveLength(1);
  return records[0] as InflightRecord;
}

describe("in-flight transfers", () => {
  it("writes the record before the wallet is asked to sign", async () => {
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    let seen: readonly InflightRecord[] = [];
    const watching: EvmAdapter = {
      ...wallet.adapter,
      sendCalls: async (calls) => {
        seen = await store.list();
        return wallet.adapter.sendCalls(calls);
      },
    };
    iris.replyToMessages({ message: FORWARDED });
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "5",
      adapter: watching,
    });
    await engine.send({ adapter: watching, quote });
    expect(seen.map((r) => r.step)).toEqual(["signing"]);
    expect((await engine.inflight()).map((r) => r.step)).toEqual(["minted"]);
  });

  it("drops the record when the payer declines and nothing was burned", async () => {
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const declining: EvmAdapter = {
      ...wallet.adapter,
      sendCalls: async () => {
        throw new UserRejectedError();
      },
    };
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "5",
      adapter: declining,
    });
    await engine.send({ adapter: declining, quote });
    expect(await engine.inflight()).toEqual([]);
  });

  it("#86 keeps a burned transfer when the tab dies and resumes it without signing again", async () => {
    const record = await sendThenLoseTheTab("Arbitrum");
    expect(record.step).toBe("burned");
    expect(record.sourceTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    const batches = wallet.batches.length;

    // A fresh engine on the same store, as after a reload.
    iris.replyToMessages({ message: FORWARDED });
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const result = await engine.resume(record);

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.finalTxHash).toBe(FORWARDED.forwardTxHash);
    }
    expect(wallet.batches).toHaveLength(batches);
    expect(wallet.feeBurns).toHaveLength(1);
    expect(
      iris.requests.some(
        (r) =>
          r.url.searchParams.get("transactionHash") === record.sourceTxHash,
      ),
    ).toBe(true);
    expect((await engine.inflight()).map((r) => r.step)).toEqual(["minted"]);
  });

  it("mints an unforwarded transfer with the destination wallet, and only once", async () => {
    const record = await sendThenLoseTheTab("Morph");
    iris.replyToMessages({ message: message(Morph.cctpDomain) });
    const engine = createWhisk({ chains: ["Base", "Morph"] });

    const first = await engine.resume(record, {
      destinationAdapter: wallet.adapter,
    });
    expect(first.kind).toBe("success");
    expect(wallet.mints.map((m) => m.chainId)).toEqual([Morph.evmChainId]);

    iris.setNonceUsed(NONCE);
    const again = await engine.resume(record, {
      destinationAdapter: wallet.adapter,
    });
    expect(again.kind).toBe("success");
    expect(wallet.mints).toHaveLength(1);
  });

  it("re-attests an expired attestation before minting", async () => {
    const record = await sendThenLoseTheTab("Morph");
    iris.setBlockNumber(100);
    iris.replyToMessages(
      { message: message(Morph.cctpDomain, {}, "50") },
      { message: message(Morph.cctpDomain, {}, "0") },
    );
    iris.replyToReattest({ message: message(Morph.cctpDomain) });
    const engine = createWhisk({ chains: ["Base", "Morph"] });

    const result = await engine.resume(record, {
      destinationAdapter: wallet.adapter,
    });
    expect(result.kind).toBe("success");
    expect(
      iris.requests
        .filter((r) => r.method === "POST")
        .map((r) => r.url.pathname),
    ).toContain(`/v2/reattest/${NONCE}`);
    expect(wallet.mints).toHaveLength(1);
  });

  it("resumes from the burn tx hash alone", async () => {
    const record = await sendThenLoseTheTab("Morph");
    await store.remove(record.id);
    iris.replyToMessages({ message: message(Morph.cctpDomain) });
    const engine = createWhisk({ chains: ["Base", "Morph"] });

    const result = await engine.resumeFromTx({
      sourceChain: "Base",
      txHash: record.sourceTxHash!,
      destinationAdapter: wallet.adapter,
    });
    expect(result.kind).toBe("success");
    expect(wallet.mints.map((m) => m.chainId)).toEqual([Morph.evmChainId]);
  });
});

describe("createStorageInflightStore", () => {
  function memoryStorage() {
    const map = new Map<string, string>();
    return {
      map,
      storage: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
        key: (i: number) => [...map.keys()][i] ?? null,
        get length() {
          return map.size;
        },
      },
    };
  }

  it("keeps records under whisk:inflight:<id> and reads back only its own", async () => {
    const { map, storage } = memoryStorage();
    map.set(
      "whisk:inflight:mainnet:evm:0xabc:Base",
      '{"version":1,"mode":"x"}',
    );
    map.set("unrelated", "1");
    const store = createStorageInflightStore(storage);
    const record: InflightRecord = {
      version: 2,
      id: "q1",
      network: "mainnet",
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      mint: "forwarder",
      speed: "fast",
      amountBurned: "5000000",
      recipient: RECIPIENT,
      step: "burned",
      sourceTxHash: `0x${"12".repeat(32)}`,
      createdAt: 1,
      updatedAt: 2,
    };
    await store.put(record);
    expect(map.has("whisk:inflight:q1")).toBe(true);
    expect(await store.list()).toEqual([record]);
    await store.remove("q1");
    expect(await store.list()).toEqual([]);
    expect(map.has("unrelated")).toBe(true);
  });
});
