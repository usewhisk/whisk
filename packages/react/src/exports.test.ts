import { describe, expect, it, vi } from "vitest";

vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  AlbedoModule: class {},
  FreighterModule: class {},
  HanaModule: class {},
  HotWalletModule: class {},
  LobstrModule: class {},
  RabetModule: class {},
  StellarWalletsKit: class {},
  WalletNetwork: {},
  xBullModule: class {},
}));
vi.mock("@starknet-io/get-starknet-core", () => ({ getStarknet: vi.fn() }));

const main = await import("./index.js");
const headless = await import("./headless.js");

describe("error exports", () => {
  it.each([
    ["@usewhisk/react", main],
    ["@usewhisk/react/headless", headless],
  ] as const)("%s exports the quote errors send can throw", (_, entry) => {
    expect(entry).toHaveProperty("QuoteExpiredError");
    expect(entry).toHaveProperty("QuoteChangedError");
  });
});
