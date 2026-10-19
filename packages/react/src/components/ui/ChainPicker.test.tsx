// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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

const { WhiskProvider } = await import("../../provider/WhiskProvider.js");
const { ChainPicker } = await import("./ChainPicker.js");
const { evm } = await import("../../config/adapters/evm.js");

beforeAll(() => {
  // Radix Select measures and scrolls with APIs jsdom leaves out.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

describe("ChainPicker", () => {
  it("#69 opens its list inside the widget's [data-whisk] root", async () => {
    render(
      <WhiskProvider
        config={{
          chains: ["Base", "Arbitrum"],
          wallets: [evm({ chains: ["Base", "Arbitrum"] })],
        }}
      >
        <ChainPicker
          value="Base"
          onChange={() => undefined}
          chains={["Base", "Arbitrum"]}
        />
      </WhiskProvider>,
    );
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    const list = await screen.findByRole("listbox");
    expect(list.closest("[data-whisk]")).not.toBeNull();
  });
});
