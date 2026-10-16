import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  Base,
  Arbitrum,
  type BurnFeeTier,
  type IrisMessage,
} from "@usewhisk/cctp";
import type { EvmAdapter } from "../adapter.js";
import type { Step } from "../../types/step.js";
import { OnchainRevertError } from "../../errors/errors.js";

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

const { pollMessagesMock } = vi.hoisted(() => ({
  pollMessagesMock: vi.fn(),
}));
vi.mock("@usewhisk/cctp", async () => {
  const actual =
    await vi.importActual<typeof import("@usewhisk/cctp")>("@usewhisk/cctp");
  return { ...actual, pollMessages: pollMessagesMock };
});

const { executeBridge } = await import("./execute.js");

const SENDER = "0x0000000000000000000000000000000000000010" as `0x${string}`;
const RECIPIENT = "0x0000000000000000000000000000000000000020";

function makeAdapter(
  opts: Partial<EvmAdapter> & { chainId?: number } = {},
): EvmAdapter {
  return {
    kind: "evm",
    address: SENDER,
    async getChainId() {
      return opts.chainId ?? Base.evmChainId;
    },
    switchChain: opts.switchChain ?? (async () => {}),
    sendCalls:
      opts.sendCalls ??
      (async (calls) => ({
        hashes: calls.map(
          (_, i) =>
            ("0x" +
              (i === 0 ? "aa" : "bb") +
              "".padEnd(64, i === 0 ? "a" : "b")) as `0x${string}`,
        ),
      })),
    waitForReceipt:
      opts.waitForReceipt ??
      (async () => ({ status: "success" as const, blockNumber: 1n })),
  };
}

beforeEach(() => {
  pollMessagesMock.mockReset();
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
  tier: FAST_TIER,
  useForwarder: true,
  sourceAdapter: makeAdapter(),
});

describe("executeBridge — forwarder happy path", () => {
  it("returns success with the forwarder tx hash and marks mint as forwarded", async () => {
    pollMessagesMock.mockResolvedValue(FORWARDED_MESSAGE);
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
  });
});

describe("executeBridge — manual mint", () => {
  it("submits receiveMessage when the forwarder is disabled", async () => {
    pollMessagesMock.mockResolvedValue(MANUAL_MESSAGE);
    const adapter = makeAdapter();
    const sendCallsSpy = vi.spyOn(adapter, "sendCalls");
    const result = await executeBridge({
      ...baseInput(),
      useForwarder: false,
      sourceAdapter: adapter,
    });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const mint = result.steps.find((s) => s.name === "mint");
      expect(mint?.forwarded).toBe(false);
    }
    // Three sendCalls invocations: (approve, burn) batch, then mint.
    expect(sendCallsSpy).toHaveBeenCalledTimes(2);
  });

  it("falls back to manual mint when the forwarder reports FAILED", async () => {
    pollMessagesMock.mockResolvedValue(FAILED_FORWARDER_MESSAGE);
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
    pollMessagesMock.mockResolvedValue(FORWARDED_MESSAGE);
    const adapter = makeAdapter({
      waitForReceipt: async () => ({ status: "reverted", blockNumber: 1n }),
    });
    const result = await executeBridge({
      ...baseInput(),
      sourceAdapter: adapter,
    });
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      // The approve step is first; it reverts, so we never reach burn.
      expect(result.error).toBeInstanceOf(OnchainRevertError);
      const snapshot = result.raw as { kind: string; recipientAddress: string };
      expect(snapshot.kind).toBe("bridge");
      expect(snapshot.recipientAddress).toBe(RECIPIENT);
    }
  });

  it("returns a polling_timeout failure when the attestation never lands", async () => {
    pollMessagesMock.mockResolvedValue(null);
    const result = await executeBridge(baseInput());
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.error.category).toBe("polling_timeout");
      const fetchStep = result.steps.find((s) => s.name === "fetchAttestation");
      expect(fetchStep?.state).toBe("error");
    }
  });

  it("returns a failed_offchain failure when Iris reports attestation failure", async () => {
    pollMessagesMock.mockResolvedValue({
      ...MANUAL_MESSAGE,
      status: "failed",
      delayReason: "expired",
    });
    const result = await executeBridge(baseInput());
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.error.category).toBe("failed_offchain");
    }
  });

  it("returns a polling_timeout failure when the forwarder doesn't finalize", async () => {
    pollMessagesMock.mockResolvedValue({
      ...MANUAL_MESSAGE,
      forwardState: "PENDING",
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
    pollMessagesMock.mockResolvedValue(FORWARDED_MESSAGE);
    const switchChain = vi.fn(async () => {});
    const adapter = makeAdapter({ chainId: 1, switchChain });
    await executeBridge({ ...baseInput(), sourceAdapter: adapter });
    expect(switchChain).toHaveBeenCalledWith(Base.evmChainId);
  });

  it("switches the destination adapter for manual mint", async () => {
    pollMessagesMock.mockResolvedValue(MANUAL_MESSAGE);
    const destSwitch = vi.fn(async () => {});
    const sourceAdapter = makeAdapter({ chainId: Base.evmChainId });
    const destinationAdapter = makeAdapter({
      chainId: Base.evmChainId, // wrong — should switch to Arbitrum
      switchChain: destSwitch,
    });
    await executeBridge({
      ...baseInput(),
      useForwarder: false,
      sourceAdapter,
      destinationAdapter,
    });
    expect(destSwitch).toHaveBeenCalledWith(Arbitrum.evmChainId);
  });
});
