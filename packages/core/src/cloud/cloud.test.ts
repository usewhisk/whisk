import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ConfigError } from "../errors/index.js";
import { createCloudSession, createMemoryCloudStorage } from "./client.js";
import { narrowConfig, parseRemoteConfig } from "./config.js";
import { assertSourceMatchesApp } from "./network.js";
import { verifySessionToken } from "./token.js";

const CLOUD = "https://api.whisk.test";
const APP = "app_0123456789ABCDEFGHJKMNPQ";
const NOW = Date.UTC(2030, 0, 1);

let signingKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: { keys: object[] };

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  signingKey = pair.privateKey;
  otherKey = (await generateKeyPair("ES256")).privateKey;
  jwks = {
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "ES256" }],
  };
});

const config = {
  schema: 1,
  disabledChains: ["Solana_Devnet"],
  disabledRoutes: [{ from: "Base_Sepolia", to: "Arc_Testnet" }],
  defaultSourceChain: "Arc_Testnet",
  defaultDestinationChain: null,
  pause: null,
  branding: { name: "Acme", accent: "#1a2b3c" },
};

async function token(
  overrides: Record<string, unknown> = {},
  options: { key?: CryptoKey; kid?: string; alg?: string; aud?: string } = {},
) {
  const iat = Math.floor(NOW / 1000);
  return new SignJWT({ env: "test", cfg: 3, config, ...overrides })
    .setProtectedHeader({
      alg: options.alg ?? "ES256",
      kid: options.kid ?? "k1",
    })
    .setIssuer(CLOUD)
    .setAudience(options.aud ?? APP)
    .setSubject("https://shop.example.com")
    .setIssuedAt(iat)
    .setExpirationTime(iat + 900)
    .setJti("j1")
    .sign(options.key ?? signingKey);
}

function keyFor() {
  return async (kid: string) =>
    kid === "k1" ? (jwks.keys[0] as JsonWebKey) : undefined;
}

describe("verifySessionToken", () => {
  const verify = (jwt: string, now = NOW) =>
    verifySessionToken(jwt, {
      appId: APP,
      issuer: CLOUD,
      keyFor: keyFor(),
      now,
    });

  it("returns the claims of a token the platform signed for this app", async () => {
    const claims = await verify(await token());
    expect(claims).toMatchObject({ env: "test", configVersion: 3, config });
    expect(claims.expiresAt).toBe(NOW + 900_000);
  });

  it("refuses another app's token, an expired one, or another issuer's", async () => {
    await expect(
      verify(await token({}, { aud: "app_ZZZZZZZZZZZZZZZZZZZZZZZZ" })),
    ).rejects.toThrow(/audience/);
    await expect(verify(await token(), NOW + 901_000)).rejects.toThrow(
      /expired/,
    );
    const foreign = await new SignJWT({ env: "test", cfg: 1, config })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setIssuer("https://evil.example")
      .setAudience(APP)
      .setIssuedAt(NOW / 1000)
      .setExpirationTime(NOW / 1000 + 900)
      .sign(signingKey);
    await expect(verify(foreign)).rejects.toThrow(/issuer/);
  });

  it("refuses a signature from any other key, an unknown kid, and a tampered payload", async () => {
    await expect(verify(await token({}, { key: otherKey }))).rejects.toThrow(
      /signature/,
    );
    await expect(verify(await token({}, { kid: "k9" }))).rejects.toThrow(/key/);
    const [header, , signature] = (await token()).split(".");
    const forged = Buffer.from(
      JSON.stringify({
        env: "live",
        cfg: 9,
        config,
        aud: APP,
        iss: CLOUD,
        exp: NOW / 1000 + 900,
      }),
    ).toString("base64url");
    await expect(verify(`${header}.${forged}.${signature}`)).rejects.toThrow(
      /signature/,
    );
  });

  it("refuses any algorithm but ES256, including none", async () => {
    const none = `${Buffer.from(JSON.stringify({ alg: "none", kid: "k1" })).toString("base64url")}.${Buffer.from(JSON.stringify({ aud: APP })).toString("base64url")}.`;
    await expect(verify(none)).rejects.toThrow(/ES256/);
  });

  it("refuses an environment it does not know", async () => {
    await expect(verify(await token({ env: "staging" }))).rejects.toThrow(
      /environment/,
    );
  });
});

describe("parseRemoteConfig", () => {
  it("reads version 1 and reports fields it ignores", () => {
    const parsed = parseRemoteConfig({
      ...config,
      fee: { bps: 500 },
      feeRecipient: "0x0000000000000000000000000000000000000001",
      recipient: "0x0000000000000000000000000000000000000001",
      features: { swaps: true },
    });
    expect(parsed?.ignored.sort()).toEqual([
      "features",
      "fee",
      "feeRecipient",
      "recipient",
    ]);
    expect(parsed?.config).toEqual({
      disabledChains: ["Solana_Devnet"],
      disabledRoutes: [{ from: "Base_Sepolia", to: "Arc_Testnet" }],
      defaultSourceChain: "Arc_Testnet",
      defaultDestinationChain: undefined,
      pause: null,
      branding: { name: "Acme", accent: "#1a2b3c" },
    });
  });

  it("ignores a whole config from a newer schema", () => {
    expect(parseRemoteConfig({ ...config, schema: 2 })).toBeUndefined();
    expect(parseRemoteConfig("nope")).toBeUndefined();
  });

  it("drops malformed fields instead of guessing", () => {
    const parsed = parseRemoteConfig({
      ...config,
      disabledChains: "Solana_Devnet",
      pause: { message: "x".repeat(141) },
      branding: { name: 42, accent: "red" },
    });
    expect(parsed?.config.disabledChains).toEqual([]);
    expect(parsed?.config.pause).toBeNull();
    expect(parsed?.config.branding).toEqual({});
    expect(parsed?.ignored.sort()).toEqual([
      "branding.accent",
      "branding.name",
      "disabledChains",
      "pause",
    ]);
  });
});

describe("narrowConfig", () => {
  const local = {
    chains: ["Base_Sepolia", "Arc_Testnet", "Solana_Devnet"] as const,
    defaultSourceChain: "Base_Sepolia" as const,
    defaultDestinationChain: "Solana_Devnet" as const,
  };
  const remote = (overrides: object) => {
    const parsed = parseRemoteConfig({ ...config, ...overrides });
    if (!parsed) throw new Error("bad test config");
    return parsed.config;
  };

  it("removes disabled chains and routes, and never adds a chain the code did not list", () => {
    const narrowed = narrowConfig(
      { ...local, chains: [...local.chains] },
      remote({
        disabledChains: ["Solana_Devnet", "Ethereum_Sepolia"],
        defaultSourceChain: "Ethereum_Sepolia",
      }),
    );
    expect(narrowed.chains).toEqual(["Base_Sepolia", "Arc_Testnet"]);
    expect(narrowed.isRouteAllowed("Base_Sepolia", "Arc_Testnet")).toBe(false);
    expect(narrowed.isRouteAllowed("Arc_Testnet", "Base_Sepolia")).toBe(true);
    expect(narrowed.isRouteAllowed("Base_Sepolia", "Solana_Devnet")).toBe(
      false,
    );
    expect(narrowed.defaultSourceChain).toBe("Base_Sepolia");
    expect(narrowed.defaultDestinationChain).toBeUndefined();
  });

  it("uses a remote default only when the chain is still enabled", () => {
    const narrowed = narrowConfig(
      { ...local, chains: [...local.chains] },
      remote({}),
    );
    expect(narrowed.defaultSourceChain).toBe("Arc_Testnet");
  });

  it("carries the pause and branding, and nothing that could move funds", () => {
    const narrowed = narrowConfig(
      { ...local, chains: [...local.chains] },
      remote({ pause: { message: "Back soon." } }),
    );
    expect(narrowed.pause).toEqual({ message: "Back soon." });
    expect(narrowed.branding).toEqual({ name: "Acme", accent: "#1a2b3c" });
    expect(Object.keys(narrowed).sort()).toEqual([
      "branding",
      "chains",
      "defaultDestinationChain",
      "defaultSourceChain",
      "isRouteAllowed",
      "pause",
    ]);
  });
});

describe("assertSourceMatchesApp", () => {
  it("refuses a source chain from the other network, before anything is signed", () => {
    expect(() => assertSourceMatchesApp("Base_Sepolia", "live")).toThrow(
      ConfigError,
    );
    expect(() => assertSourceMatchesApp("Base", "test")).toThrow(ConfigError);
    expect(() => assertSourceMatchesApp("Base", "live")).not.toThrow();
    expect(() => assertSourceMatchesApp("Arc_Testnet", "test")).not.toThrow();
  });
});

describe("createCloudSession", () => {
  function platform(
    options: { down?: boolean; jwt?: () => Promise<string> } = {},
  ) {
    const calls: string[] = [];
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (options.down) throw new TypeError("fetch failed");
        if (url.endsWith("/v1/sessions")) {
          expect(JSON.parse(String(init?.body))).toEqual({
            appId: APP,
            sdkVersion: "0.4.0",
          });
          expect(init?.credentials).toBe("omit");
          return Response.json({
            token: await (options.jwt ?? token)(),
            expiresAt: "x",
          });
        }
        if (url.endsWith("/.well-known/jwks.json")) return Response.json(jwks);
        return new Response("not found", { status: 404 });
      },
    );
    return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
  }

  const open = (
    fetch: typeof globalThis.fetch,
    storage = createMemoryCloudStorage(),
    now = NOW,
  ) =>
    createCloudSession({
      appId: APP,
      cloudUrl: CLOUD,
      sdkVersion: "0.4.0",
      fetch,
      storage,
      now: () => now,
    });

  it("starts local, and moves to the verified cloud config after a handshake", async () => {
    const { fetch } = platform();
    const session = open(fetch);
    expect(session.state()).toMatchObject({
      source: "local",
      reason: "not-yet",
    });
    const state = await session.refresh();
    expect(state).toMatchObject({
      source: "cloud",
      env: "test",
      configVersion: 3,
    });
  });

  it("fetches the JWKS once per key", async () => {
    const { fetch, calls } = platform();
    const session = open(fetch);
    await session.refresh();
    await session.refresh();
    expect(calls.filter((c) => c.includes("jwks")).length).toBe(1);
  });

  it("falls back to the last verified config while it is valid, then to local config", async () => {
    const storage = createMemoryCloudStorage();
    await open(platform().fetch, storage).refresh();
    const down = platform({ down: true }).fetch;
    expect(await open(down, storage, NOW + 60_000).refresh()).toMatchObject({
      source: "stored",
      configVersion: 3,
    });
    expect(await open(down, storage, NOW + 901_000).refresh()).toMatchObject({
      source: "local",
      reason: "unreachable",
    });
  });

  it("never stores or uses a token that fails verification", async () => {
    const storage = createMemoryCloudStorage();
    const forged = platform({ jwt: () => token({}, { key: otherKey }) }).fetch;
    expect(await open(forged, storage).refresh()).toMatchObject({
      source: "local",
      reason: "invalid-token",
    });
    expect(
      await open(platform({ down: true }).fetch, storage).refresh(),
    ).toMatchObject({
      source: "local",
    });
  });

  it("ignores a stored config written for another app", async () => {
    const storage = createMemoryCloudStorage();
    await open(platform().fetch, storage).refresh();
    const other = createCloudSession({
      appId: "app_ZZZZZZZZZZZZZZZZZZZZZZZZ",
      cloudUrl: CLOUD,
      sdkVersion: "0.4.0",
      fetch: platform({ down: true }).fetch,
      storage,
      now: () => NOW,
    });
    expect(await other.refresh()).toMatchObject({ source: "local" });
  });
});
