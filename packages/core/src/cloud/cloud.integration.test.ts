/**
 * Live handshake against a running Whisk Cloud API. Skipped by default. Run
 * the platform API locally with a test app that allows localhost, then:
 *   WHISK_CLOUD_TEST_URL=http://127.0.0.1:4100 \
 *   WHISK_CLOUD_TEST_APP_ID=app_... pnpm --filter @usewhisk/core test
 */
import { describe, expect, it } from "vitest";
import { createCloudSession } from "./client.js";
import { narrowConfig } from "./config.js";
import { assertSourceMatchesApp } from "./network.js";

const URL_ = process.env["WHISK_CLOUD_TEST_URL"];
const APP_ID = process.env["WHISK_CLOUD_TEST_APP_ID"];

// Node's fetch sends no Origin header; a browser always does.
const asBrowser: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string>),
      origin: "http://localhost:5173",
    },
  });

describe.skipIf(!URL_ || !APP_ID)("Whisk Cloud handshake (live)", () => {
  it("verifies a real token against the real JWKS and narrows local config with it", async () => {
    const session = createCloudSession({
      appId: APP_ID ?? "",
      cloudUrl: URL_ ?? "",
      sdkVersion: "0.4.0",
      fetch: asBrowser,
    });
    const state = await session.refresh();
    expect(state).toMatchObject({ source: "cloud", env: "test" });
    if (state.source === "local") return;
    const narrowed = narrowConfig(
      { chains: ["Base_Sepolia", "Arc_Testnet"] },
      state.config,
    );
    expect(
      narrowed.chains.every((c) => ["Base_Sepolia", "Arc_Testnet"].includes(c)),
    ).toBe(true);
    expect(() =>
      assertSourceMatchesApp("Base_Sepolia", state.env),
    ).not.toThrow();
    expect(() => assertSourceMatchesApp("Base", state.env)).toThrow();
  });

  it("keeps paying on local config when the origin is not allowed", async () => {
    const session = createCloudSession({
      appId: APP_ID ?? "",
      cloudUrl: URL_ ?? "",
      sdkVersion: "0.4.0",
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string>),
            origin: "https://evil.example",
          },
        }),
    });
    expect(await session.refresh()).toMatchObject({
      source: "local",
      reason: "refused",
    });
  });
});
