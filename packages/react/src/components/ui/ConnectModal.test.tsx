// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PAYER, WithWhisk, fakeEngine } from "../../test/widget.js";

const disconnectAsync = vi.fn();

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: PAYER,
    isConnected: true,
    chain: { name: "Base" },
  }),
  useConnect: () => ({ connectors: [], connectAsync: vi.fn(), reset: vi.fn() }),
  useDisconnect: () => ({ disconnectAsync }),
}));
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ connected: false, publicKey: null, wallet: null }),
}));
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

const { ConnectModal } = await import("./ConnectModal.js");

afterEach(cleanup);

describe("ConnectModal", () => {
  it("shows a failed disconnect and stays open", async () => {
    disconnectAsync.mockRejectedValue(new Error("wallet is locked"));
    const onOpenChange = vi.fn();
    render(
      <WithWhisk engine={fakeEngine()}>
        <ConnectModal open onOpenChange={onOpenChange} />
      </WithWhisk>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "wallet is locked",
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
