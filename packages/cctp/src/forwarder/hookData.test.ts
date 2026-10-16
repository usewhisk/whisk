import { describe, expect, it } from "vitest";
import {
  ANY_DESTINATION_CALLER,
  CCTP_FORWARD_HOOK_DATA,
  CCTP_FORWARD_HOOK_DATA_LENGTH,
  buildForwarderHookData,
  isForwarderHookData,
} from "./index.js";

describe("forwarder hookData", () => {
  it("constant is 32 bytes (66 chars with 0x prefix)", () => {
    expect(CCTP_FORWARD_HOOK_DATA).toHaveLength(
      2 + CCTP_FORWARD_HOOK_DATA_LENGTH * 2,
    );
  });

  it("starts with the cctp-forward ASCII bytes", () => {
    // "cctp-forward" = 0x636374702d666f7277617264
    expect(CCTP_FORWARD_HOOK_DATA.slice(0, 26)).toBe(
      "0x636374702d666f7277617264",
    );
  });

  it("zero-pads bytes 12 through 31", () => {
    expect(CCTP_FORWARD_HOOK_DATA.slice(26)).toBe(
      "0000000000000000000000000000000000000000",
    );
  });

  it("buildForwarderHookData() == CCTP_FORWARD_HOOK_DATA", () => {
    expect(buildForwarderHookData()).toBe(CCTP_FORWARD_HOOK_DATA);
  });

  it("isForwarderHookData detects the magic prefix", () => {
    expect(isForwarderHookData(CCTP_FORWARD_HOOK_DATA)).toBe(true);
    expect(isForwarderHookData("0xdeadbeef")).toBe(false);
    expect(isForwarderHookData("deadbeef")).toBe(false);
  });

  it("isForwarderHookData is case-insensitive", () => {
    expect(
      isForwarderHookData(
        CCTP_FORWARD_HOOK_DATA.toUpperCase().replace("0X", "0x"),
      ),
    ).toBe(true);
  });

  it("ANY_DESTINATION_CALLER is bytes32(0)", () => {
    expect(ANY_DESTINATION_CALLER).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    );
    expect(ANY_DESTINATION_CALLER).toHaveLength(66);
  });
});
