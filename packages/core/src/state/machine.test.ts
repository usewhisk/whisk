import { describe, expect, it } from "vitest";
import {
  initialState,
  initialSteps,
  reduce,
  type WhiskAction,
} from "./machine.js";
import type { ResolvedRecipient } from "../types/recipient.js";
import type { Quote } from "../types/quote.js";
import type { WhiskState } from "../types/state.js";
import { WhiskError } from "../errors/errors.js";

const recipient: ResolvedRecipient = {
  address: "0x1111111111111111111111111111111111111111",
  chain: "Arc_Testnet",
};

const sendQuote: Quote = {
  id: "q1",
  issuedAt: 0,
  expiresAt: 60_000,
  feeMode: "maxFee",
  route: { kind: "send", chain: "Arc_Testnet" },
  recipient,
  amountIn: "10",
  amountOut: "10",
  amountBurned: "10",
  token: "USDC",
  fees: { total: "0", token: "USDC", entries: [] },
  subunits: {
    requested: 10_000_000n,
    amountIn: 10_000_000n,
    burnAmount: 0n,
    burnFee: 0n,
    forwarderFee: 0n,
    maxFee: 0n,
    amountOut: 10_000_000n,
    customFee: 0n,
  },
};

const bridgeQuote: Quote = {
  ...sendQuote,
  route: {
    kind: "bridge",
    sourceChain: "Arc_Testnet",
    destinationChain: "Base_Sepolia",
  },
};

const dummyError = new WhiskError({
  code: "UNKNOWN",
  message: "boom",
});

describe("state machine — initial conditions", () => {
  it("starts disconnected", () => {
    expect(initialState).toEqual({ kind: "disconnected" });
  });

  it("builds the right initial steps for send", () => {
    expect(initialSteps("send").map((s) => s.name)).toEqual([
      "approve",
      "transfer",
    ]);
    expect(initialSteps("send").every((s) => s.state === "pending")).toBe(true);
  });

  it("builds the right initial steps for bridge", () => {
    expect(initialSteps("bridge").map((s) => s.name)).toEqual([
      "approve",
      "burn",
      "fetchAttestation",
      "mint",
    ]);
  });
});

describe("state machine — connect / disconnect", () => {
  it("CONNECTED moves disconnected → idle", () => {
    const next = reduce({ kind: "disconnected" }, { type: "CONNECTED" });
    expect(next).toEqual({ kind: "idle" });
  });

  it("CONNECTED is a no-op when already idle", () => {
    const next = reduce({ kind: "idle" }, { type: "CONNECTED" });
    expect(next).toEqual({ kind: "idle" });
  });

  it("DISCONNECTED returns to disconnected from any state", () => {
    const states: WhiskState[] = [
      { kind: "idle" },
      { kind: "resolving", input: "a" },
      { kind: "resolved", recipient },
      { kind: "review", quote: sendQuote },
    ];
    for (const s of states) {
      expect(reduce(s, { type: "DISCONNECTED" })).toEqual({
        kind: "disconnected",
      });
    }
  });
});

describe("state machine — resolve", () => {
  it("RESOLVE_START moves idle → resolving", () => {
    const next = reduce(
      { kind: "idle" },
      {
        type: "RESOLVE_START",
        input: "alice.eth",
      },
    );
    expect(next).toEqual({ kind: "resolving", input: "alice.eth" });
  });

  it("RESOLVE_START is also valid from resolved (re-input)", () => {
    const next = reduce(
      { kind: "resolved", recipient },
      {
        type: "RESOLVE_START",
        input: "bob.eth",
      },
    );
    expect(next.kind).toBe("resolving");
  });

  it("RESOLVE_START is a no-op outside idle/resolved", () => {
    const next = reduce(
      { kind: "disconnected" },
      {
        type: "RESOLVE_START",
        input: "a",
      },
    );
    expect(next).toEqual({ kind: "disconnected" });
  });

  it("RESOLVE_SUCCESS moves resolving → resolved", () => {
    const next = reduce(
      { kind: "resolving", input: "alice.eth" },
      { type: "RESOLVE_SUCCESS", recipient },
    );
    expect(next).toEqual({ kind: "resolved", recipient });
  });

  it("RESOLVE_FAILURE moves resolving → failed", () => {
    const next = reduce(
      { kind: "resolving", input: "alice.eth" },
      { type: "RESOLVE_FAILURE", error: dummyError },
    );
    expect(next).toEqual({ kind: "failed", error: dummyError });
  });
});

describe("state machine — quote / review", () => {
  it("QUOTE_START moves resolved → quoting", () => {
    const action: WhiskAction = {
      type: "QUOTE_START",
      recipient,
      amount: "10",
    };
    const next = reduce({ kind: "resolved", recipient }, action);
    expect(next).toEqual({ kind: "quoting", recipient, amount: "10" });
  });

  it("QUOTE_START is valid from review (re-quote on amount change)", () => {
    const action: WhiskAction = {
      type: "QUOTE_START",
      recipient,
      amount: "20",
    };
    const next = reduce({ kind: "review", quote: sendQuote }, action);
    expect(next.kind).toBe("quoting");
  });

  it("QUOTE_SUCCESS moves quoting → review", () => {
    const next = reduce(
      { kind: "quoting", recipient, amount: "10" },
      { type: "QUOTE_SUCCESS", quote: sendQuote },
    );
    expect(next).toEqual({ kind: "review", quote: sendQuote });
  });

  it("REVIEW_BACK moves review → resolved (preserving recipient)", () => {
    const next = reduce(
      { kind: "review", quote: sendQuote },
      {
        type: "REVIEW_BACK",
      },
    );
    expect(next).toEqual({ kind: "resolved", recipient });
  });

  it("REVIEW_BACK is a no-op outside review", () => {
    const next = reduce({ kind: "idle" }, { type: "REVIEW_BACK" });
    expect(next).toEqual({ kind: "idle" });
  });
});

describe("state machine — sending lifecycle", () => {
  it("SEND_START seeds steps from the route kind", () => {
    const next = reduce(
      { kind: "review", quote: sendQuote },
      {
        type: "SEND_START",
      },
    );
    expect(next.kind).toBe("sending");
    if (next.kind !== "sending") return;
    expect(next.steps.map((s) => s.name)).toEqual(["approve", "transfer"]);
    expect(next.currentStep).toBe("approve");
  });

  it("SEND_START seeds bridge-specific steps for bridge routes", () => {
    const next = reduce(
      { kind: "review", quote: bridgeQuote },
      {
        type: "SEND_START",
      },
    );
    expect(next.kind).toBe("sending");
    if (next.kind !== "sending") return;
    expect(next.steps.map((s) => s.name)).toEqual([
      "approve",
      "burn",
      "fetchAttestation",
      "mint",
    ]);
  });

  it("STEP_UPDATE marks a step success and advances currentStep", () => {
    const sending = reduce(
      { kind: "review", quote: bridgeQuote },
      {
        type: "SEND_START",
      },
    );
    if (sending.kind !== "sending") throw new Error("setup");
    const next = reduce(sending, {
      type: "STEP_UPDATE",
      step: { name: "approve", state: "success", txHash: "0xabc" },
    });
    if (next.kind !== "sending") throw new Error("expected sending");
    expect(next.steps[0]).toMatchObject({
      name: "approve",
      state: "success",
      txHash: "0xabc",
    });
    expect(next.currentStep).toBe("burn");
  });

  it("STEP_UPDATE keeps currentStep when no further pending step", () => {
    const sending = reduce(
      { kind: "review", quote: sendQuote },
      {
        type: "SEND_START",
      },
    );
    if (sending.kind !== "sending") throw new Error("setup");
    let cur = sending;
    cur = reduce(cur, {
      type: "STEP_UPDATE",
      step: { name: "approve", state: "success" },
    }) as typeof cur;
    cur = reduce(cur, {
      type: "STEP_UPDATE",
      step: { name: "transfer", state: "success" },
    }) as typeof cur;
    if (cur.kind !== "sending") throw new Error("expected sending");
    expect(cur.steps.every((s) => s.state === "success")).toBe(true);
  });

  it("SEND_SUCCESS moves sending → succeeded", () => {
    const sending = reduce(
      { kind: "review", quote: sendQuote },
      {
        type: "SEND_START",
      },
    );
    const next = reduce(sending, {
      type: "SEND_SUCCESS",
      finalTxHash: "0xfff",
    });
    expect(next.kind).toBe("succeeded");
    if (next.kind !== "succeeded") return;
    expect(next.finalTxHash).toBe("0xfff");
    expect(next.quote).toBe(sendQuote);
  });

  it("SEND_FAILURE moves sending → failed and preserves quote/steps", () => {
    const sending = reduce(
      { kind: "review", quote: sendQuote },
      {
        type: "SEND_START",
      },
    );
    const next = reduce(sending, { type: "SEND_FAILURE", error: dummyError });
    expect(next.kind).toBe("failed");
    if (next.kind !== "failed") return;
    expect(next.error).toBe(dummyError);
    expect(next.quote).toBe(sendQuote);
  });
});

describe("state machine — RESET", () => {
  it("RESET returns to idle from any non-disconnected state", () => {
    expect(
      reduce({ kind: "review", quote: sendQuote }, { type: "RESET" }),
    ).toEqual({
      kind: "idle",
    });
    expect(
      reduce({ kind: "failed", error: dummyError }, { type: "RESET" }),
    ).toEqual({
      kind: "idle",
    });
  });

  it("RESET stays disconnected when disconnected", () => {
    expect(reduce({ kind: "disconnected" }, { type: "RESET" })).toEqual({
      kind: "disconnected",
    });
  });
});
