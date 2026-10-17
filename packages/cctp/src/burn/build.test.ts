import { describe, expect, it } from "vitest";
import {
  Arbitrum,
  Base,
  BaseSepolia,
  Ethereum,
  EthereumSepolia,
  Avalanche,
} from "../chains/index.js";
import {
  CCTP_FORWARD_HOOK_DATA,
  ANY_DESTINATION_CALLER,
} from "../forwarder/index.js";
import { FINALITY_FAST } from "../iris/index.js";
import type { BurnFeeTier } from "../iris/types.js";
import {
  InvalidInputError,
  ProtocolError,
  UnsupportedError,
} from "../errors.js";
import { buildBurnIntent } from "./index.js";

const FAST_TIER: BurnFeeTier = {
  finalityThreshold: 1000,
  minimumFee: 1.3,
  forwardFee: { low: 206035, med: 207543, high: 209052 },
};

const RECIPIENT = "0x000000000000000000000000000000000000Beef";

describe("buildBurnIntent — happy path", () => {
  it("produces approve + burn calls by default", () => {
    const intent = buildBurnIntent({
      source: Base,
      destination: Arbitrum,
      amount: 5_000_000n,
      mintRecipient: RECIPIENT,
      fee: { tier: FAST_TIER },
    });

    expect(intent.calls).toHaveLength(2);
    expect(intent.calls[0]?.to).toBe(Base.usdc);
    expect(intent.calls[1]?.to).toBe(Base.tokenMessenger);
    // approve selector
    expect(intent.calls[0]?.data.slice(0, 10)).toBe("0x095ea7b3");
    // depositForBurnWithHook starts with its own selector
    expect(intent.calls[1]?.data.length).toBeGreaterThan(10);
  });

  it("skips approve when skipApprove=true", () => {
    const intent = buildBurnIntent({
      source: Base,
      destination: Arbitrum,
      amount: 5_000_000n,
      mintRecipient: RECIPIENT,
      skipApprove: true,
      fee: { tier: FAST_TIER },
    });
    expect(intent.calls).toHaveLength(1);
    expect(intent.calls[0]?.to).toBe(Base.tokenMessenger);
  });

  it("uses depositForBurn (no hook) when withForwarder=false", () => {
    const withFwd = buildBurnIntent({
      source: Base,
      destination: Arbitrum,
      amount: 1_000_000n,
      mintRecipient: RECIPIENT,
      fee: { tier: FAST_TIER },
    });
    const noFwd = buildBurnIntent({
      source: Base,
      destination: Arbitrum,
      amount: 1_000_000n,
      mintRecipient: RECIPIENT,
      withForwarder: false,
      fee: { tier: FAST_TIER },
    });
    expect(withFwd.calls[1]?.data).not.toBe(noFwd.calls[1]?.data);
    expect(withFwd.withForwarder).toBe(true);
    expect(noFwd.withForwarder).toBe(false);
  });

  it("packs the right fee components", () => {
    const intent = buildBurnIntent({
      source: Base,
      destination: Arbitrum,
      amount: 1_000_000n,
      mintRecipient: RECIPIENT,
      fee: { tier: FAST_TIER },
    });
    // 1.3 bps on 1 USDC = 130 subunits
    expect(intent.burnFee).toBe(130n);
    // med forwarder fee
    expect(intent.forwarderFee).toBe(207_543n);
    expect(intent.maxFee).toBe(207_673n);
  });

  it("encodes mintRecipient as 32-byte left-pad", () => {
    const intent = buildBurnIntent({
      source: Base,
      destination: Arbitrum,
      amount: 1_000_000n,
      mintRecipient: RECIPIENT,
      fee: { tier: FAST_TIER },
    });
    expect(intent.mintRecipientBytes32).toBe(
      "0x000000000000000000000000000000000000000000000000000000000000beef",
    );
  });

  it("works on testnet with the testnet tokenMessenger address", () => {
    const intent = buildBurnIntent({
      source: BaseSepolia,
      destination: EthereumSepolia,
      amount: 1_000_000n,
      mintRecipient: RECIPIENT,
      fee: { tier: FAST_TIER },
    });
    expect(intent.calls[1]?.to).toBe(BaseSepolia.tokenMessenger);
    expect(intent.source).toBe(BaseSepolia);
    expect(intent.destination).toBe(EthereumSepolia);
  });
});

describe("buildBurnIntent — Fast-only policy", () => {
  it("always emits Fast Transfer (1000) on the burn", () => {
    const intent = buildBurnIntent({
      source: Base,
      destination: Arbitrum,
      amount: 1_000_000n,
      mintRecipient: RECIPIENT,
      fee: { tier: FAST_TIER },
    });
    expect(intent.finalityThreshold).toBe(FINALITY_FAST);
  });

  it("rejects a source chain that doesn't support Fast Transfer", () => {
    const noFastChain = {
      ...Avalanche,
      capabilities: { ...Avalanche.capabilities, fastSource: false },
    };
    expect(() =>
      buildBurnIntent({
        source: noFastChain,
        destination: Arbitrum,
        amount: 1_000_000n,
        mintRecipient: RECIPIENT,
        fee: { tier: FAST_TIER },
      }),
    ).toThrow(/Fast Transfer/);
  });
});

describe("buildBurnIntent — validation", () => {
  it("rejects same source and destination domain", () => {
    expect(() =>
      buildBurnIntent({
        source: Base,
        destination: Base,
        amount: 1_000_000n,
        mintRecipient: RECIPIENT,
        fee: { tier: FAST_TIER },
      }),
    ).toThrow(InvalidInputError);
  });

  it("rejects zero amount", () => {
    expect(() =>
      buildBurnIntent({
        source: Base,
        destination: Arbitrum,
        amount: 0n,
        mintRecipient: RECIPIENT,
        fee: { tier: FAST_TIER },
      }),
    ).toThrow(/positive/);
  });

  it("rejects amount above 10M USDC", () => {
    expect(() =>
      buildBurnIntent({
        source: Base,
        destination: Arbitrum,
        amount: 10_000_001n * 1_000_000n,
        mintRecipient: RECIPIENT,
        fee: { tier: FAST_TIER },
      }),
    ).toThrow(ProtocolError);
  });

  it("rejects invalid mintRecipient", () => {
    expect(() =>
      buildBurnIntent({
        source: Base,
        destination: Arbitrum,
        amount: 1_000_000n,
        mintRecipient: "not-an-address",
        fee: { tier: FAST_TIER },
      }),
    ).toThrow(InvalidInputError);
  });

  it("rejects approveAmount lower than amount", () => {
    expect(() =>
      buildBurnIntent({
        source: Base,
        destination: Arbitrum,
        amount: 5_000_000n,
        approveAmount: 1_000_000n,
        mintRecipient: RECIPIENT,
        fee: { tier: FAST_TIER },
      }),
    ).toThrow(/approveAmount/);
  });
});

describe("buildBurnIntent — non-EVM ecosystem guard", () => {
  it("throws UnsupportedError on non-EVM source", () => {
    // Cast through unknown — the registry today only contains EVM
    // chains, so the type narrows them all to ecosystem='evm'. v1.1+
    // adds non-EVM rows; until then we exercise the guard via cast.
    const fakeSolanaChain = {
      ...Base,
      ecosystem: "solana",
    } as unknown as typeof Base;
    expect(() =>
      buildBurnIntent({
        source: fakeSolanaChain,
        destination: Arbitrum,
        amount: 1_000_000n,
        mintRecipient: RECIPIENT,
        fee: { tier: FAST_TIER },
      }),
    ).toThrow(UnsupportedError);
  });
});

describe("buildBurnIntent — destinationCaller", () => {
  it("defaults to ANY_DESTINATION_CALLER (bytes32(0))", () => {
    const intent = buildBurnIntent({
      source: Base,
      destination: Arbitrum,
      amount: 1_000_000n,
      mintRecipient: RECIPIENT,
      fee: { tier: FAST_TIER },
    });
    // We can't easily decode the calldata in a unit test, but verify
    // the call doesn't differ when we explicitly pass ANY.
    const sameWithExplicit = buildBurnIntent({
      source: Base,
      destination: Arbitrum,
      amount: 1_000_000n,
      mintRecipient: RECIPIENT,
      destinationCaller: ANY_DESTINATION_CALLER,
      fee: { tier: FAST_TIER },
    });
    expect(intent.calls[1]?.data).toBe(sameWithExplicit.calls[1]?.data);
  });
});

describe("buildBurnIntent — forwarder hookData", () => {
  it("with forwarder, the hookData is the canonical magic bytes", () => {
    const intent = buildBurnIntent({
      source: Base,
      destination: Arbitrum,
      amount: 1_000_000n,
      mintRecipient: RECIPIENT,
      fee: { tier: FAST_TIER },
    });
    // The hookData appears at the end of the calldata. Check it's present.
    const callData = intent.calls[1]?.data ?? "";
    expect(callData.toLowerCase()).toContain(
      CCTP_FORWARD_HOOK_DATA.slice(2).toLowerCase(),
    );
  });
});
