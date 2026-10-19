import { describe, expect, it } from "vitest";
import { InvalidInputError } from "../errors.js";
import { decodeBurnMessage } from "./index.js";

// Base Sepolia to Arc Testnet, 1 USDC with upfront fees, burned on
// 2026-10-18 (0x4135...f3bf). Iris's own decoding is the expected value.
const MESSAGE =
  "0x00000001000000060000001a71deaec6f99811b1edc8293e5e9d0aa6f6e9a8f72d2dab0061cf0977637625b00000000000000000000000008fe6b999dc680ccfdd5bf7eb0974218be2542daa0000000000000000000000008fe6b999dc680ccfdd5bf7eb0974218be2542daa0000000000000000000000000000000000000000000000000000000000000000000003e8000003e800000001000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e000000000000000000000000be03ce9d6001d27be41fc87e3e3f777d04e70fe200000000000000000000000000000000000000000000000000000000000f42400000000000000000000000008745d906d67c346e5eb1aeeed38eb87f34df0c0a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040ee4d5636374702d666f72776172640000000000000000000000000000000000000000" as const;

const pad = (address: string) => `0x${"0".repeat(24)}${address.slice(2)}`;

describe("decodeBurnMessage", () => {
  it("reads every field of a real testnet burn as Iris decoded it", () => {
    expect(decodeBurnMessage(MESSAGE)).toEqual({
      version: 1,
      sourceDomain: 6,
      destinationDomain: 26,
      nonce:
        "0x71deaec6f99811b1edc8293e5e9d0aa6f6e9a8f72d2dab0061cf0977637625b0",
      sender: pad("0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa"),
      recipient: pad("0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa"),
      destinationCaller: `0x${"0".repeat(64)}`,
      minFinalityThreshold: 1000,
      finalityThresholdExecuted: 1000,
      body: {
        version: 1,
        burnToken: pad("0x036cbd53842c5426634e7929541ec2318f3dcf7e"),
        mintRecipient: pad("0xbe03ce9d6001d27be41fc87e3e3f777d04e70fe2"),
        amount: 1_000_000n,
        messageSender: pad("0x8745d906d67c346e5eb1aeeed38eb87f34df0c0a"),
        maxFee: 0n,
        feeExecuted: 0n,
        expirationBlock: 68_084_949n,
        hookData:
          "0x636374702d666f72776172640000000000000000000000000000000000000000",
      },
    });
  });

  it("refuses bytes too short to hold a burn", () => {
    expect(() => decodeBurnMessage(`0x${"00".repeat(200)}`)).toThrow(
      InvalidInputError,
    );
  });
});
