import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Arbitrum, Base, type IrisMessage } from "@usewhisk/cctp";
import { createWhisk } from "../engine/createWhisk.js";
import { ScreeningError } from "../errors/index.js";
import {
  createMemoryInflightStore,
  type InflightStore,
} from "../inflight/index.js";
import {
  createFakeEvmWallet,
  createFakeIris,
  type FakeEvmWallet,
  type FakeIris,
} from "../test/harness/index.js";
import type {
  CloudApi,
  ReportInput,
  ReportedTransfer,
  ScreenInput,
  ScreenOutcome,
} from "./api.js";
import { withWhiskCloud } from "./whisk.js";

const RECIPIENT = "0x0000000000000000000000000000000000000020";
const NONCE = `0x${"ab".repeat(32)}` as const;
const FORWARD_HOOK = `0x636374702d666f7277617264${"00".repeat(20)}` as const;
const MINT_HASH = `0x${"ff".repeat(32)}` as const;
const TRANSFER = "trf_0123456789ABCDEFGHJKMNPQRS";

const word = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");
const u32 = (n: number) => n.toString(16).padStart(8, "0");

/** Circle's forwarded message for a 5 USDC burn from Base to Arbitrum. */
const FORWARDED: IrisMessage = {
  message: `0x${[
    u32(1),
    u32(Base.cctpDomain),
    u32(Arbitrum.cctpDomain),
    word(NONCE),
    word("0x0"),
    word("0x0"),
    word("0x0"),
    u32(1000),
    u32(1000),
    u32(1),
    word(Base.usdc),
    word(RECIPIENT),
    word(5_000_000n.toString(16)),
    word("0x0"),
    word("0x0"),
    word("0x0"),
    word("0x0"),
    FORWARD_HOOK.slice(2),
  ].join("")}`,
  attestation: `0x${"22".repeat(65)}`,
  eventNonce: NONCE,
  status: "complete",
  cctpVersion: 2,
  forwardState: "COMPLETE",
  forwardTxHash: MINT_HASH,
  decodedMessage: {
    sourceDomain: String(Base.cctpDomain),
    destinationDomain: String(Arbitrum.cctpDomain),
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
      expirationBlock: "0",
      hookData: FORWARD_HOOK,
    },
  },
};

class FakeCloud implements CloudApi {
  screens: ScreenInput[] = [];
  reports: ReportInput[] = [];
  outcome: ScreenOutcome = "clear";
  reportAnswer: () => Promise<ReportedTransfer | undefined> = () =>
    Promise.resolve({
      id: TRANSFER,
      state: "reported",
      recoveryUrl: `https://dashboard.whisk.test/r/${TRANSFER}`,
    });

  screen(input: ScreenInput): Promise<ScreenOutcome> {
    this.screens.push(input);
    return Promise.resolve(this.outcome);
  }

  report(input: ReportInput): Promise<ReportedTransfer | undefined> {
    this.reports.push(input);
    return this.reportAnswer();
  }
}

let iris: FakeIris;
let store: InflightStore;
let wallet: FakeEvmWallet;
let cloud: FakeCloud;
let failClosed: boolean;

beforeEach(() => {
  iris = createFakeIris();
  store = createMemoryInflightStore();
  wallet = createFakeEvmWallet({ chainId: Base.evmChainId });
  wallet.fund(Base.evmChainId, Base.usdc, 100_000_000n);
  cloud = new FakeCloud();
  failClosed = false;
  vi.stubGlobal("fetch", () => {
    throw new Error("the engine used the global fetch");
  });
});
afterEach(() => vi.unstubAllGlobals());

function engine() {
  return withWhiskCloud(
    createWhisk({
      chains: ["Base", "Arbitrum"],
      fetch: iris.fetch,
      inflightStore: store,
    }),
    { api: cloud, failClosed: () => failClosed },
  );
}

const quoteParams = () => ({
  sourceChain: "Base" as const,
  destinationChain: "Arbitrum" as const,
  recipient: { address: RECIPIENT, chain: "Arbitrum" as const },
  amount: "5",
  adapter: wallet.adapter,
});

describe("the quote-time screen", () => {
  it("screens the paying wallet on the source chain and the recipient on the destination", async () => {
    const whisk = engine();
    const quote = await whisk.quote(quoteParams());
    expect(quote.recipient.address).toBe(RECIPIENT);
    expect(cloud.screens).toEqual([
      {
        payer: { chain: "Base", address: wallet.adapter.address },
        recipient: { chain: "Arbitrum", address: RECIPIENT },
      },
    ]);
  });

  // ADR check: a sanctioned address blocks the quote before anything is signed.
  it("throws ScreeningError on a hit, so no quote exists to sign", async () => {
    cloud.outcome = "hit";
    const whisk = engine();
    await expect(whisk.quote(quoteParams())).rejects.toBeInstanceOf(
      ScreeningError,
    );
    expect(wallet.batches).toEqual([]);
    expect(await whisk.inflight()).toEqual([]);
  });

  it("goes ahead when Whisk Cloud could not screen, unless the app fails closed", async () => {
    cloud.outcome = "unavailable";
    await expect(engine().quote(quoteParams())).resolves.toBeDefined();
    failClosed = true;
    await expect(engine().quote(quoteParams())).rejects.toMatchObject({
      code: "SCREENING_REFUSED",
      reason: "unscreened",
    });
  });
});

describe("reporting", () => {
  it("reports the burn the moment the wallet returns it, then its mint, and keeps the transfer ID", async () => {
    iris.replyToMessages({ message: FORWARDED });
    const whisk = engine();
    const quote = await whisk.quote(quoteParams());
    const burns: string[] = [];
    const result = await whisk.send(
      { adapter: wallet.adapter, quote },
      { onBurnSubmitted: (hash) => burns.push(hash) },
    );
    await whisk.settled();
    expect(result.kind).toBe("success");
    const [burn] = burns;
    expect(burn).toMatch(/^0x[0-9a-f]{64}$/);
    expect(cloud.reports).toEqual([
      { sourceChain: "Base", burnTxHash: burn, clientTransferId: quote.id },
      {
        sourceChain: "Base",
        burnTxHash: burn,
        clientTransferId: quote.id,
        mintTxHash: MINT_HASH,
      },
    ]);
    expect(whisk.transferFor("Base", burn ?? "")).toEqual({
      id: TRANSFER,
      state: "reported",
      recoveryUrl: `https://dashboard.whisk.test/r/${TRANSFER}`,
    });
  });

  it("never lets a failed report fail or hold up the payment", async () => {
    iris.replyToMessages({ message: FORWARDED });
    const waiting: (() => void)[] = [];
    cloud.reportAnswer = () =>
      new Promise((resolve) => {
        waiting.push(() => {
          resolve(undefined);
        });
      });
    const whisk = engine();
    const quote = await whisk.quote(quoteParams());
    const result = await whisk.send({ adapter: wallet.adapter, quote });
    expect(result.kind).toBe("success");
    expect(waiting.length).toBeGreaterThan(0);
    for (const release of waiting) release();
    await whisk.settled();
    expect(whisk.transferFor("Base", cloud.reports[0]?.burnTxHash ?? "")).toBe(
      undefined,
    );
  });

  it("reports the mint of a resumed transfer against its burn", async () => {
    const whisk = engine();
    const quote = await whisk.quote(quoteParams());
    wallet.dropNextReceipt();
    await whisk.send({ adapter: wallet.adapter, quote });
    const [record] = await whisk.inflight();
    if (!record?.sourceTxHash) throw new Error("expected a burned record");
    await whisk.settled();
    cloud.reports = [];

    iris.replyToMessages({ message: FORWARDED });
    const reloaded = engine();
    const resumed = await reloaded.resume(record);
    await reloaded.settled();
    expect(resumed.kind).toBe("success");
    expect(cloud.reports).toEqual([
      {
        sourceChain: "Base",
        burnTxHash: record.sourceTxHash,
        clientTransferId: record.id,
        mintTxHash: MINT_HASH,
      },
    ]);
  });
});
