import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import { Arbitrum, Base, Edge, Solana, Stellar } from "../chains/index.js";
import { tokenMessengerWithFeesAbi, usdcAbi } from "../abi/index.js";
import { toBytes32 } from "../encoding/index.js";
import { InvalidInputError, UnsupportedError } from "../errors.js";
import { buildBurnWithFeesIntent } from "./index.js";

const RECIPIENT = "0x000000000000000000000000000000000000Beef";
const PAYER = "0x0000000000000000000000000000000000000010";
const SIGNED = "0x0100aa" as const;
const ZERO32 = `0x${"00".repeat(32)}`;

describe("buildBurnWithFeesIntent", () => {
  it("approves TokenMessengerWithFees for amount plus fee and burns with the signed quote", () => {
    const intent = buildBurnWithFeesIntent({
      source: Base,
      destination: Arbitrum,
      amount: 5_000_000n,
      fee: 76_937n,
      mintRecipient: RECIPIENT,
      signedQuote: SIGNED,
      refundAddress: PAYER,
    });
    expect(intent.calls).toHaveLength(2);

    const [approve, burn] = intent.calls;
    expect(approve?.to).toBe(Base.usdc);
    expect(decodeFunctionData({ abi: usdcAbi, data: approve!.data })).toEqual({
      functionName: "approve",
      args: [Base.tokenMessengerWithFees, 5_076_937n],
    });

    expect(burn?.to).toBe(Base.tokenMessengerWithFees);
    expect(burn?.value).toBe(0n);
    const decoded = decodeFunctionData({
      abi: tokenMessengerWithFeesAbi,
      data: burn!.data,
    });
    expect(decoded.functionName).toBe("depositForBurnWithFees");
    expect(decoded.args).toEqual([
      5_000_000n,
      Arbitrum.cctpDomain,
      toBytes32(RECIPIENT),
      Base.usdc,
      ZERO32,
      { signedQuote: SIGNED, refundAddress: PAYER },
    ]);
  });

  it("encodes a Solana recipient as its 32 bytes", () => {
    const intent = buildBurnWithFeesIntent({
      source: Base,
      destination: Solana,
      amount: 5_000_000n,
      fee: 650n,
      mintRecipient: "11111111111111111111111111111112",
      signedQuote: SIGNED,
      refundAddress: PAYER,
    });
    const decoded = decodeFunctionData({
      abi: tokenMessengerWithFeesAbi,
      data: intent.calls[1]!.data,
    });
    expect(decoded.args?.[2]).toBe(`0x${"00".repeat(31)}01`);
  });

  it("refuses a source without TokenMessengerWithFees", () => {
    expect(() =>
      buildBurnWithFeesIntent({
        source: Edge,
        destination: Arbitrum,
        amount: 5_000_000n,
        fee: 1n,
        mintRecipient: RECIPIENT,
        signedQuote: SIGNED,
        refundAddress: PAYER,
      }),
    ).toThrow(UnsupportedError);
  });

  it("refuses a Stellar destination, whose mint needs custom hook data", () => {
    expect(() =>
      buildBurnWithFeesIntent({
        source: Base,
        destination: Stellar,
        amount: 5_000_000n,
        fee: 1n,
        mintRecipient: `0x${"11".repeat(32)}`,
        signedQuote: SIGNED,
        refundAddress: PAYER,
      }),
    ).toThrow(UnsupportedError);
  });

  it("refuses an invalid recipient or refund address", () => {
    const base = {
      source: Base,
      destination: Arbitrum,
      amount: 5_000_000n,
      fee: 1n,
      signedQuote: SIGNED,
    } as const;
    expect(() =>
      buildBurnWithFeesIntent({
        ...base,
        mintRecipient: "nope",
        refundAddress: PAYER,
      }),
    ).toThrow(InvalidInputError);
    expect(() =>
      buildBurnWithFeesIntent({
        ...base,
        mintRecipient: RECIPIENT,
        refundAddress: "0x12",
      }),
    ).toThrow(InvalidInputError);
  });
});
