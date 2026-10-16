import { describe, expect, it } from "vitest";
import { encodeFunctionData } from "viem";
import {
  tokenMessengerV2Abi,
  messageTransmitterV2Abi,
  usdcAbi,
} from "./index.js";

describe("ABIs are valid", () => {
  it("tokenMessengerV2 encodes depositForBurnWithHook", () => {
    const data = encodeFunctionData({
      abi: tokenMessengerV2Abi,
      functionName: "depositForBurnWithHook",
      args: [
        100_000_000n,
        6,
        ("0x" + "11".repeat(32)) as `0x${string}`,
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        ("0x" + "00".repeat(32)) as `0x${string}`,
        500_000n,
        1000,
        "0x636374702d666f72776172640000000000000000000000000000000000000000",
      ],
    });
    // Selector starts the encoded call.
    expect(data).toMatch(/^0x[a-fA-F0-9]+$/);
    expect(data.length).toBeGreaterThan(10);
  });

  it("tokenMessengerV2 encodes depositForBurn", () => {
    const data = encodeFunctionData({
      abi: tokenMessengerV2Abi,
      functionName: "depositForBurn",
      args: [
        1_000_000n,
        3,
        ("0x" + "22".repeat(32)) as `0x${string}`,
        "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        ("0x" + "00".repeat(32)) as `0x${string}`,
        100n,
        1000,
      ],
    });
    expect(data).toMatch(/^0x[a-fA-F0-9]+$/);
  });

  it("messageTransmitterV2 encodes receiveMessage", () => {
    const data = encodeFunctionData({
      abi: messageTransmitterV2Abi,
      functionName: "receiveMessage",
      args: ["0xdeadbeef", "0xcafebabe"],
    });
    expect(data).toMatch(/^0x[a-fA-F0-9]+$/);
  });

  it("usdc encodes approve", () => {
    const data = encodeFunctionData({
      abi: usdcAbi,
      functionName: "approve",
      args: ["0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d", 1_000_000n],
    });
    expect(data).toMatch(/^0x095ea7b3/); // approve selector
  });

  it("usdc encodes transfer", () => {
    const data = encodeFunctionData({
      abi: usdcAbi,
      functionName: "transfer",
      args: ["0x000000000000000000000000000000000000beef", 5_000_000n],
    });
    expect(data).toMatch(/^0xa9059cbb/); // transfer selector
  });
});
