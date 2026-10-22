import { describe, expect, it } from "vitest";
import { ConfigError } from "../errors/errors.js";
import { mergeMetadata, validateMetadata } from "./validate.js";
import { METADATA_MAX_BYTES } from "./types.js";

describe("validateMetadata", () => {
  it("accepts an empty object", () => {
    expect(() => validateMetadata({})).not.toThrow();
  });

  it("accepts string, number, and boolean values", () => {
    expect(() =>
      validateMetadata({
        orderId: "ORD-12345",
        amount: 42,
        priority: true,
      }),
    ).not.toThrow();
  });

  it("rejects null", () => {
    expect(() => validateMetadata(null)).toThrow(ConfigError);
  });

  it("rejects arrays", () => {
    expect(() => validateMetadata([])).toThrow(ConfigError);
    expect(() => validateMetadata(["a", "b"])).toThrow(ConfigError);
  });

  it("rejects primitives", () => {
    expect(() => validateMetadata("string")).toThrow(ConfigError);
    expect(() => validateMetadata(42)).toThrow(ConfigError);
    expect(() => validateMetadata(true)).toThrow(ConfigError);
  });

  it("rejects empty-string keys", () => {
    expect(() => validateMetadata({ "": "value" })).toThrow(/non-empty/);
  });

  it("rejects keys with the reserved __ prefix", () => {
    expect(() => validateMetadata({ __raw: "0x00" })).toThrow(/reserved/);
    expect(() => validateMetadata({ __version: 1 })).toThrow(/reserved/);
  });

  it("rejects nested objects", () => {
    expect(() =>
      validateMetadata({ shipping: { address: "..." } as unknown as string }),
    ).toThrow(/string, number, or boolean/);
  });

  it("rejects nested arrays as values", () => {
    expect(() =>
      validateMetadata({ tags: ["a", "b"] as unknown as string }),
    ).toThrow(/string, number, or boolean/);
  });

  it("rejects NaN and Infinity", () => {
    expect(() => validateMetadata({ x: NaN })).toThrow(/finite/);
    expect(() => validateMetadata({ x: Infinity })).toThrow(/finite/);
    expect(() => validateMetadata({ x: -Infinity })).toThrow(/finite/);
  });

  it("accepts numbers at the edges of finite", () => {
    expect(() =>
      validateMetadata({
        max: Number.MAX_SAFE_INTEGER,
        min: Number.MIN_SAFE_INTEGER,
        zero: 0,
        neg: -1,
      }),
    ).not.toThrow();
  });

  it("enforces the 1 KB size cap on serialized JSON", () => {
    // A 1024-byte value won't fit because the JSON wrapper adds quotes + key.
    const oversized = { blob: "x".repeat(METADATA_MAX_BYTES) };
    expect(() => validateMetadata(oversized)).toThrow(/exceeds/);
  });

  it("counts UTF-8 byte length, not character length", () => {
    // Each "🚀" is 4 bytes in UTF-8. 260 of them = 1040 bytes of emoji plus
    // the JSON wrapper, so this should reject.
    const emojiBlob = { blob: "🚀".repeat(260) };
    expect(() => validateMetadata(emojiBlob)).toThrow(/exceeds/);
  });

  it("accepts a payload right at the size cap", () => {
    // Find a fill length whose serialized JSON is just under 1024 bytes.
    // {"k":"<fill>"} = 8 + fill.length bytes (with key "k", 1-char ASCII fill).
    const fillLength = METADATA_MAX_BYTES - 8;
    expect(() => validateMetadata({ k: "x".repeat(fillLength) })).not.toThrow();
  });
});

describe("mergeMetadata", () => {
  it("returns undefined when both inputs are undefined", () => {
    expect(mergeMetadata(undefined, undefined)).toBeUndefined();
  });

  it("returns undefined when both inputs are empty", () => {
    expect(mergeMetadata({}, {})).toBeUndefined();
  });

  it("returns the per-call object when defaults are undefined", () => {
    const result = mergeMetadata(undefined, { orderId: "X" });
    expect(result).toEqual({ orderId: "X" });
  });

  it("returns the defaults when per-call is undefined", () => {
    const result = mergeMetadata({ source: "checkout" }, undefined);
    expect(result).toEqual({ source: "checkout" });
  });

  it("merges defaults and per-call, per-call wins on conflict", () => {
    const result = mergeMetadata(
      { source: "checkout", env: "prod" },
      { orderId: "X-001", env: "test" },
    );
    expect(result).toEqual({
      source: "checkout",
      env: "test",
      orderId: "X-001",
    });
  });
});
