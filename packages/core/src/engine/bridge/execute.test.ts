import { describe, expect, it, beforeEach } from "vitest";
import { Base, Arbitrum, type IrisMessage } from "@usewhisk/cctp";
import type { Step } from "../../types/step.js";
import { OnchainRevertError } from "../../errors/errors.js";
import { executeBridge } from "./execute.js";
import {
  createFakeEvmWallet,
  createFakeIris,
  FAST_FEE_TIER,
  type FakeEvmWallet,
  type FakeIris,
} from "../../test/harness/index.js";

const FORWARDED_MESSAGE: IrisMessage = {
  message: ("0x" + "11".repeat(32)) as `0x${string}`,
  attestation: ("0x" + "22".repeat(65)) as `0x${string}`,
  eventNonce: "1",
  status: "complete",
  cctpVersion: 2,
  forwardState: "COMPLETE",
  forwardTxHash: "0xff".padEnd(66, "f"),
};

const MANUAL_MESSAGE: IrisMessage = {
  message: ("0x" + "33".repeat(32)) as `0x${string}`,
  attestation: ("0x" + "44".repeat(65)) as `0x${string}`,
  eventNonce: "2",
  status: "complete",
  cctpVersion: 2,
  forwardState: null,
};

const FAILED_FORWARDER_MESSAGE: IrisMessage = {
  ...MANUAL_MESSAGE,
  forwardState: "FAILED",
};

const RECIPIENT = "0x0000000000000000000000000000000000000020";

function makeWallet(chainId: number = Base.evmChainId): FakeEvmWallet {
  const wallet = createFakeEvmWallet({ chainId });
  wallet.fund(Base.evmChainId, Base.usdc, 100_000_000n);
  return wallet;
}

let iris: FakeIris;
let wallet: FakeEvmWallet;
beforeEach(() => {
  iris = createFakeIris();
  wallet = makeWallet();
});

const baseInput = (): Parameters<typeof executeBridge>[0] => ({
  network: "mainnet",
  source: Base,
  destination: Arbitrum,
  recipientAddress: RECIPIENT,
  burnAmount: 5_000_000n,
  maxFee: 251_000n,
  burnFee: 1_000n,
  forwarderFee: 250_000n,
  tier: FAST_FEE_TIER,
  useForwarder: true,
  sourceAdapter: wallet.adapter,
  fetch: iris.fetch,
  pollIntervalMs: 1,
  pollTimeoutMs: 50,
});

describe("executeBridge — forwarder happy path", () => {
  it("returns success with the forwarder tx hash and marks mint as forwarded", async () => {
    iris.replyToMessages({ message: FORWARDED_MESSAGE });
    const events: Step[] = [];
    const result = await executeBridge(baseInput(), {
      onStep: (s) => events.push(s),
    });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.finalTxHash).toBe(FORWARDED_MESSAGE.forwardTxHash);
      const mint = result.steps.find((s) => s.name === "mint");
      expect(mint?.state).toBe("success");
      expect(mint?.forwarded).toBe(true);
    }
    // Step order observed: approve → burn → fetchAttestation → mint.
    expect(events.map((e) => `${e.name}:${e.state}`)).toEqual([
      "approve:pending",
      "approve:success",
      "burn:pending",
      "burn:success",
      "fetchAttestation:pending",
      "fetchAttestation:success",
      "mint:success",
    ]);
    expect(wallet.burns).toHaveLength(1);
    expect(wallet.burns[0]).toMatchObject({
      chainId: Base.evmChainId,
      tokenMessenger: Base.tokenMessenger,
      amount: 5_000_000n,
      destinationDomain: Arbitrum.cctpDomain,
    });
    expect(wallet.balanceOf(Base.evmChainId, Base.usdc)).toBe(95_000_000n);
  });
});

describe("executeBridge — manual mint", () => {
  it("submits receiveMessage when the forwarder is disabled", async () => {
    iris.replyToMessages({ message: MANUAL_MESSAGE });
    const result = await executeBridge({
      ...baseInput(),
      useForwarder: false,
    });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const mint = result.steps.find((s) => s.name === "mint");
      expect(mint?.forwarded).toBe(false);
    }
    // Two batches: approve and burn, then the mint.
    expect(wallet.batches).toHaveLength(2);
    expect(wallet.mints).toEqual([
      {
        chainId: Arbitrum.evmChainId,
        messageTransmitter: Arbitrum.messageTransmitter,
        message: MANUAL_MESSAGE.message,
        attestation: MANUAL_MESSAGE.attestation,
      },
    ]);
  });

  it("falls back to manual mint when the forwarder reports FAILED", async () => {
    iris.replyToMessages({ message: FAILED_FORWARDER_MESSAGE });
    const result = await executeBridge(baseInput());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const mint = result.steps.find((s) => s.name === "mint");
      expect(mint?.forwarded).toBe(false);
    }
  });
});

describe("executeBridge — failures", () => {
  it("maps a burn revert to OnchainRevertError and snapshots the burn hash", async () => {
    iris.replyToMessages({ message: FORWARDED_MESSAGE });
    wallet.revertNext("approve");
    const result = await executeBridge(baseInput());
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      // The approve step is first; it reverts, so we never reach burn.
      expect(result.error).toBeInstanceOf(OnchainRevertError);
      const snapshot = result.raw as { kind: string; recipientAddress: string };
      expect(snapshot.kind).toBe("bridge");
      expect(snapshot.recipientAddress).toBe(RECIPIENT);
    }
    expect(wallet.burns).toHaveLength(0);
  });

  it("returns a polling_timeout failure when the attestation never lands", async () => {
    const result = await executeBridge(baseInput());
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.error.category).toBe("polling_timeout");
      const fetchStep = result.steps.find((s) => s.name === "fetchAttestation");
      expect(fetchStep?.state).toBe("error");
    }
  });

  it("treats a delay reason as a slow attestation, not a failure", async () => {
    // Iris has no failed status: a short fee or allowance only slows it down.
    iris.replyToMessages(
      {
        message: {
          ...MANUAL_MESSAGE,
          status: "pending_confirmations",
          delayReason: "insufficient_fee",
        },
      },
      { message: MANUAL_MESSAGE },
    );
    const result = await executeBridge({
      ...baseInput(),
      useForwarder: false,
    });
    expect(result.kind).toBe("success");
  });

  it("returns a polling_timeout failure when the forwarder doesn't finalize", async () => {
    iris.replyToMessages({
      message: { ...MANUAL_MESSAGE, forwardState: "PENDING" },
    });
    const result = await executeBridge(baseInput());
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.error.category).toBe("polling_timeout");
      const mintStep = result.steps.find((s) => s.name === "mint");
      expect(mintStep?.state).toBe("error");
    }
  });
});

describe("executeBridge — chain switching", () => {
  it("switches the source adapter to the source chain if needed", async () => {
    iris.replyToMessages({ message: FORWARDED_MESSAGE });
    const onMainnet = makeWallet(1);
    await executeBridge({ ...baseInput(), sourceAdapter: onMainnet.adapter });
    expect(onMainnet.switches).toEqual([Base.evmChainId]);
  });

  it("switches the destination adapter for manual mint", async () => {
    iris.replyToMessages({ message: MANUAL_MESSAGE });
    // Starts on Base, so the manual mint has to switch it to Arbitrum.
    const destination = makeWallet(Base.evmChainId);
    await executeBridge({
      ...baseInput(),
      useForwarder: false,
      destinationAdapter: destination.adapter,
    });
    expect(destination.switches).toEqual([Arbitrum.evmChainId]);
  });
});
