import { describe, expect, it } from "vitest";
import {
  WhiskError,
  NoAdapterError,
  NetworkError,
  UserRejectedError,
  toWhiskError,
  cleanErrorMessage,
} from "./errors.js";

describe("toWhiskError", () => {
  it("returns a WhiskError unchanged", () => {
    const original = new NoAdapterError();
    expect(toWhiskError(original)).toBe(original);
  });

  it("classifies user rejections from the message", () => {
    const result = toWhiskError(new Error("User rejected the request"));
    expect(result).toBeInstanceOf(UserRejectedError);
    expect(result.code).toBe("USER_REJECTED");
    expect(result.retryable).toBe(true);
  });

  it("classifies user denials too (MetaMask wording)", () => {
    const result = toWhiskError(
      new Error("MetaMask Tx Signature: User denied transaction signature."),
    );
    expect(result.code).toBe("USER_REJECTED");
  });

  it("shows a friendly message for a cancelled tx, keeping the raw dump on cause", () => {
    const raw = new Error(
      "Unknown blockchain error on Arc Testnet: User rejected the request. " +
        "Request Arguments: chain: Arc Testnet (id: 5042002) from: 0xd9d… " +
        "Details: MetaMask Tx Signature: User denied transaction signature. " +
        "Version: viem@2.48.4",
    );
    const result = toWhiskError(raw);
    expect(result).toBeInstanceOf(UserRejectedError);
    expect(result.message).toBe(
      "You cancelled the transaction in your wallet.",
    );
    expect(result.cause).toBe(raw);
  });

  it("strips the viem/App Kit boilerplate from unknown errors", () => {
    const result = toWhiskError(
      new Error(
        "Unknown blockchain error on Base Sepolia: execution reverted. " +
          "Request Arguments: chain: Base Sepolia data: 0x… Version: viem@2.48.4",
      ),
    );
    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe("execution reverted.");
  });

  it("has no special message for a routing API's no-route text, which no CCTP path produces", () => {
    const original = new Error(
      "Stablecoin Service createSwap failed: Route or resource not found. " +
        "Details: No route available",
    );
    const result = toWhiskError(original);
    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe(cleanErrorMessage(original.message));
    expect(result.cause).toBe(original);
  });

  it("classifies transient network failures", () => {
    for (const msg of [
      "ECONNRESET",
      "ETIMEDOUT",
      "fetch failed",
      "socket hang up",
      "Request returned status code 502",
    ]) {
      const result = toWhiskError(new Error(msg));
      expect(result).toBeInstanceOf(NetworkError);
      expect(result.retryable).toBe(true);
    }
  });

  it("falls back to UNKNOWN for unrecognised errors", () => {
    const result = toWhiskError(new Error("something exploded"));
    expect(result.code).toBe("UNKNOWN");
    expect(result.retryable).toBe(false);
    expect(result).toBeInstanceOf(WhiskError);
  });

  it("accepts a plain string", () => {
    const result = toWhiskError("nope");
    expect(result.message).toBe("nope");
    expect(result.code).toBe("UNKNOWN");
  });

  it("uses the fallback message when the error is unhelpful", () => {
    const result = toWhiskError(undefined, "default message");
    expect(result.message).toBe("default message");
  });

  it("preserves the original cause for debugging", () => {
    const inner = new Error("root cause");
    const wrapped = toWhiskError(inner);
    expect(wrapped.cause).toBe(inner);
  });

  it("survives `instanceof` after structured throw/catch", () => {
    try {
      throw new NoAdapterError();
    } catch (err) {
      expect(err).toBeInstanceOf(NoAdapterError);
      expect(err).toBeInstanceOf(WhiskError);
    }
  });
});
