import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair as StellarKeypair } from "@stellar/stellar-sdk";
import {
  Base,
  Solana,
  Starknet,
  Stellar,
  deriveTokenMessenger,
  deriveUsedNonce,
  toBytes32,
  type IrisMessage,
  type StellarInvocation,
} from "@usewhisk/cctp";
import type {
  SolanaAdapter,
  StarknetAdapter,
  StellarAdapter,
} from "./adapter.js";
import { createMemoryInflightStore } from "../inflight/index.js";
import type { InflightRecord, InflightStore } from "../inflight/index.js";
import type { Chain } from "../types/chain.js";
import { createWhisk } from "./createWhisk.js";
import { createFakeIris, type FakeIris } from "../test/harness/index.js";

const NONCE = `0x${"cd".repeat(32)}` as const;
const BURN_TX = `0x${"77".repeat(32)}`;

const word = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");
const u32 = (n: number) => n.toString(16).padStart(8, "0");

/** A CCTP V2 burn message laid out as the contracts write it. */
function burnMessage(
  destinationDomain: number,
  mintRecipient: string,
  expirationBlock = 0n,
): `0x${string}` {
  return `0x${[
    u32(1),
    u32(Base.cctpDomain),
    u32(destinationDomain),
    word(NONCE),
    word("0x0"),
    word("0x0"),
    word("0x0"),
    u32(1000),
    u32(1000),
    u32(1),
    word(toBytes32(Base.usdc)),
    word(mintRecipient),
    word(5_000_000n.toString(16)),
    word("0x0"),
    word("0x0"),
    word("0x0"),
    word(expirationBlock.toString(16)),
  ].join("")}`;
}

function attested(message: `0x${string}`, expirationBlock = "0"): IrisMessage {
  return {
    message,
    attestation: `0x${"22".repeat(65)}`,
    eventNonce: NONCE,
    status: "complete",
    cctpVersion: 2,
    decodedMessage: {
      sourceDomain: String(Base.cctpDomain),
      destinationDomain: String(Number.parseInt(message.slice(18, 26), 16)),
      nonce: NONCE,
      sender: null,
      recipient: null,
      destinationCaller: null,
      minFinalityThreshold: "1000",
      finalityThresholdExecuted: "1000",
      messageBody: "0x",
      decodedMessageBody: {
        burnToken: Base.usdc,
        mintRecipient: null,
        amount: "5000000",
        messageSender: null,
        maxFee: "0",
        feeExecuted: "0",
        expirationBlock,
        hookData: null,
      },
    },
  };
}

function record(destinationChain: Chain, recipient: string): InflightRecord {
  return {
    version: 2,
    id: `resume-${destinationChain}`,
    network: "mainnet",
    sourceChain: "Base",
    destinationChain,
    mint: "adapter",
    speed: "fast",
    amountBurned: "5000000",
    recipient,
    step: "burned",
    sourceTxHash: BURN_TX,
    createdAt: 1,
    updatedAt: 1,
  };
}

let iris: FakeIris;
let store: InflightStore;
beforeEach(() => {
  iris = createFakeIris();
  store = createMemoryInflightStore();
  vi.stubGlobal("fetch", () => {
    throw new Error("the engine used the global fetch");
  });
});
afterEach(() => vi.unstubAllGlobals());

const engineFor = (destination: Chain) =>
  createWhisk({
    chains: ["Base", destination],
    fetch: iris.fetch,
    inflightStore: store,
  });

function stellarWallet(reverts = 0) {
  const invocations: StellarInvocation[] = [];
  let left = reverts;
  const adapter: StellarAdapter = {
    kind: "stellar",
    address: StellarKeypair.random().publicKey(),
    async getNetwork() {
      return "public";
    },
    async submitInvocation(batch) {
      invocations.push(...batch);
      return { hashes: [`stellar-mint-${invocations.length}`] };
    },
    async confirmTransaction() {
      if (left > 0) {
        left -= 1;
        return { status: "reverted" as const, ledger: 1 };
      }
      return { status: "success" as const, ledger: 1 };
    },
    async getLatestLedger() {
      return 1;
    },
  };
  return { adapter, invocations };
}

describe("resume into Stellar", () => {
  it("mints with the Stellar wallet, and not again once the nonce is used", async () => {
    const recipient = `0x${"55".repeat(32)}`;
    iris.replyToMessages({
      message: attested(burnMessage(Stellar.cctpDomain, recipient)),
    });
    const wallet = stellarWallet();
    const engine = engineFor("Stellar");

    const first = await engine.resume(record("Stellar", recipient), {
      destinationAdapter: wallet.adapter,
    });
    expect(first.kind).toBe("success");
    expect(wallet.invocations.map((i) => i.functionName)).toEqual([
      "mint_and_forward",
    ]);

    iris.setNonceUsed(NONCE);
    const again = await engine.resume(record("Stellar", recipient), {
      destinationAdapter: wallet.adapter,
    });
    expect(again.kind).toBe("success");
    expect(wallet.invocations).toHaveLength(1);
  });

  it("re-attests and mints once more when the mint reverts on an expired attestation", async () => {
    const recipient = `0x${"55".repeat(32)}`;
    const expired = burnMessage(Stellar.cctpDomain, recipient, 50n);
    iris.replyToMessages(
      { message: attested(expired, "50") },
      { message: attested(burnMessage(Stellar.cctpDomain, recipient), "0") },
    );
    iris.replyToReattest({ message: attested(expired) });
    const wallet = stellarWallet(1);

    const result = await engineFor("Stellar").resume(
      record("Stellar", recipient),
      {
        destinationAdapter: wallet.adapter,
      },
    );
    expect(result.kind).toBe("success");
    expect(wallet.invocations).toHaveLength(2);
    expect(
      iris.requests
        .filter((r) => r.method === "POST")
        .map((r) => r.url.pathname),
    ).toContain(`/v2/reattest/${NONCE}`);
  });
});

describe("resume into Starknet", () => {
  it("mints with the Starknet wallet, and not again once the nonce is used", async () => {
    const recipient = `0x${"66".repeat(32)}`;
    iris.replyToMessages({
      message: attested(burnMessage(Starknet.cctpDomain, recipient)),
    });
    const calls: { entrypoint: string }[] = [];
    const wallet: StarknetAdapter = {
      kind: "starknet",
      address: recipient,
      async getChainId() {
        return Starknet.chainId;
      },
      async submitCalls(batch) {
        calls.push(...batch);
        return { hashes: [`0x${calls.length.toString(16)}`] };
      },
      async confirmTransaction() {
        return { status: "success" as const, blockNumber: 1 };
      },
    };
    const engine = engineFor("Starknet");

    const first = await engine.resume(record("Starknet", recipient), {
      destinationAdapter: wallet,
    });
    expect(first.kind).toBe("success");
    expect(calls.map((c) => c.entrypoint)).toEqual(["receive_message"]);

    iris.setNonceUsed(NONCE);
    await engine.resume(record("Starknet", recipient), {
      destinationAdapter: wallet,
    });
    expect(calls).toHaveLength(1);
  });
});

describe("resume into Solana", () => {
  it("mints into the recipient's USDC account, and not again once the nonce is used", async () => {
    const owner = Keypair.generate().publicKey;
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(Solana.usdc),
      owner,
    );
    const ataHex = `0x${Buffer.from(ata.toBytes()).toString("hex")}`;
    const message = burnMessage(Solana.cctpDomain, ataHex);
    iris.replyToMessages({ message: attested(message) });

    const feeRecipient = Keypair.generate().publicKey;
    const messengerData = new Uint8Array(141);
    messengerData.set(feeRecipient.toBytes(), 109);
    const accounts = new Map<string, Uint8Array>([
      [
        deriveTokenMessenger(
          new PublicKey(Solana.tokenMessengerMinter),
        ).toBase58(),
        messengerData,
      ],
      [ata.toBase58(), new Uint8Array(165)],
    ]);
    const sent: unknown[] = [];
    const wallet: SolanaAdapter = {
      kind: "solana",
      address: Keypair.generate().publicKey.toBase58(),
      async getCluster() {
        return "mainnet-beta";
      },
      async sendTransaction(instructions) {
        sent.push(...instructions);
        return { signature: `solana-mint-${sent.length}` };
      },
      async confirmTransaction() {
        return { status: "success" as const, slot: 1n };
      },
      async getAccountInfo(pubkey) {
        const data = accounts.get(pubkey);
        return data ? { data } : null;
      },
    };
    const engine = engineFor("Solana");

    const first = await engine.resume(record("Solana", owner.toBase58()), {
      destinationAdapter: wallet,
    });
    expect(first.kind).toBe("success");
    expect(sent).toHaveLength(1);

    const usedNonce = deriveUsedNonce(
      new PublicKey(Solana.messageTransmitter),
      Buffer.from(message.slice(2), "hex"),
    );
    accounts.set(usedNonce.toBase58(), new Uint8Array(1));
    await engine.resume(record("Solana", owner.toBase58()), {
      destinationAdapter: wallet,
    });
    expect(sent).toHaveLength(1);
  });
});
