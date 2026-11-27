/**
 * Live handshake against a running Whisk Cloud API. Skipped by default. Run
 * the platform API locally with a test app that allows localhost, then:
 *   WHISK_CLOUD_TEST_URL=http://127.0.0.1:4100 \
 *   WHISK_CLOUD_TEST_APP_ID=app_... pnpm --filter @usewhisk/core test
 */
import { describe, expect, it } from "vitest";
import { createCloudApi } from "./api.js";
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

  // On the real OFAC list. The platform's nightly sync must have run.
  const LISTED = "0x1cab8177ace78b1b6b1c393371f4f2dcae40cbeb";

  function api() {
    const session = createCloudSession({
      appId: APP_ID ?? "",
      cloudUrl: URL_ ?? "",
      sdkVersion: "0.4.0",
      fetch: asBrowser,
    });
    return createCloudApi({
      session,
      cloudUrl: URL_ ?? "",
      fetch: asBrowser,
    });
  }

  it("screens a clean pair through, and stops a payer on the OFAC list", async () => {
    const cloud = api();
    const clean = await cloud.screen({
      payer: {
        chain: "Base_Sepolia",
        address: "0x00000000000000000000000000000000000000c1",
      },
      recipient: {
        chain: "Solana_Devnet",
        address: "FJJzw4icrdfvEGR8niuGzDFFCMgPtBjHDnpqdH9oTffy",
      },
    });
    expect(["clear", "partial"]).toContain(clean);
    expect(
      await cloud.screen({
        payer: { chain: "Base_Sepolia", address: LISTED },
        recipient: {
          chain: "Base_Sepolia",
          address: "0x00000000000000000000000000000000000000c1",
        },
      }),
    ).toBe("hit");
  });

  it("reports a burn once, and returns the same transfer for a repeat with its mint", async () => {
    const cloud = api();
    const burnTxHash = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")}`;
    const input = {
      sourceChain: "Base_Sepolia",
      burnTxHash,
      clientTransferId: crypto.randomUUID(),
    };
    const first = await cloud.report(input);
    expect(first).toMatchObject({ state: "reported" });
    expect(first?.id).toMatch(/^trf_/);
    const again = await cloud.report({
      ...input,
      mintTxHash: `0x${"ee".repeat(32)}`,
    });
    expect(again?.id).toBe(first?.id);
  });
});
