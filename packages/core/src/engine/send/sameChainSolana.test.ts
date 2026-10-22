import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { Solana, SolanaDevnet, type SolanaInstruction } from "@usewhisk/cctp";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  InvalidAddressError,
  OnchainRevertError,
  WhiskError,
} from "../../errors/errors.js";
import type { SolanaAdapter } from "../adapter.js";
import { executeSameChainSolanaSend } from "./sameChainSolana.js";

const SENDER = Keypair.generate().publicKey;
const RECIPIENT = Keypair.generate().publicKey.toBase58();
const SIG = "5".repeat(88); // shape of a real signature, content irrelevant

function makeAdapter(
  opts: {
    cluster?: "mainnet-beta" | "devnet";
    sendTransaction?: SolanaAdapter["sendTransaction"];
    confirmTransaction?: SolanaAdapter["confirmTransaction"];
  } = {},
): SolanaAdapter {
  return {
    kind: "solana",
    address: SENDER.toBase58(),
    async getCluster() {
      return opts.cluster ?? "devnet";
    },
    sendTransaction: opts.sendTransaction ?? (async () => ({ signature: SIG })),
    confirmTransaction:
      opts.confirmTransaction ??
      (async () => ({ status: "success" as const, slot: 0n })),
    async getAccountInfo() {
      return null;
    },
  };
}

describe("executeSameChainSolanaSend", () => {
  it("submits ATA-idempotent + transferChecked instructions and returns success", async () => {
    let submitted: SolanaInstruction[] = [];
    const adapter = makeAdapter({
      sendTransaction: async (instructions) => {
        submitted = instructions;
        return { signature: SIG };
      },
    });

    const result = await executeSameChainSolanaSend({
      chain: SolanaDevnet,
      recipientAddress: RECIPIENT,
      amount: 1_000_000n,
      adapter,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.finalTxHash).toBe(SIG);
      expect(result.steps.map((s) => `${s.name}:${s.state}`)).toEqual([
        "approve:noop",
        "transfer:success",
      ]);
    }

    expect(submitted).toHaveLength(2);
    // The first creates the recipient's account; the second transfers.
    expect(submitted[1]?.programId.toBase58()).toBe(
      TOKEN_PROGRAM_ID.toBase58(),
    );
  });

  it("emits step events as the transfer progresses", async () => {
    const events: string[] = [];
    await executeSameChainSolanaSend(
      {
        chain: SolanaDevnet,
        recipientAddress: RECIPIENT,
        amount: 1_000_000n,
        adapter: makeAdapter(),
      },
      { onStep: (s) => events.push(`${s.name}:${s.state}`) },
    );
    expect(events).toEqual(["transfer:pending", "transfer:success"]);
  });

  it("fails cleanly when the wallet is on the wrong cluster", async () => {
    const result = await executeSameChainSolanaSend({
      chain: SolanaDevnet,
      recipientAddress: RECIPIENT,
      amount: 1_000_000n,
      adapter: makeAdapter({ cluster: "mainnet-beta" }),
    });
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.error).toBeInstanceOf(WhiskError);
      expect(result.error.message).toMatch(/mainnet-beta|devnet|expected/i);
    }
  });

  it("rejects an invalid recipient address before prompting the wallet", async () => {
    let called = false;
    const result = await executeSameChainSolanaSend({
      chain: SolanaDevnet,
      recipientAddress: "not-a-pubkey",
      amount: 1_000_000n,
      adapter: makeAdapter({
        sendTransaction: async () => {
          called = true;
          return { signature: SIG };
        },
      }),
    });
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.error).toBeInstanceOf(InvalidAddressError);
    }
    expect(called).toBe(false);
  });

  it("maps a reverted confirmation into OnchainRevertError", async () => {
    const result = await executeSameChainSolanaSend({
      chain: SolanaDevnet,
      recipientAddress: RECIPIENT,
      amount: 1_000_000n,
      adapter: makeAdapter({
        confirmTransaction: async () => ({
          status: "reverted",
          slot: 0n,
        }),
      }),
    });
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.error).toBeInstanceOf(OnchainRevertError);
      expect(result.steps[1]?.txHash).toBe(SIG);
    }
  });

  it("works on Solana mainnet too (different cluster name)", async () => {
    const result = await executeSameChainSolanaSend({
      chain: Solana,
      recipientAddress: RECIPIENT,
      amount: 500_000n,
      adapter: makeAdapter({ cluster: "mainnet-beta" }),
    });
    expect(result.kind).toBe("success");
  });
});
