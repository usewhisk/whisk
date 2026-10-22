// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { RouteUnavailableError, type InflightRecord } from "@usewhisk/core";
import { PAYER, RECIPIENT, WithWhisk, fakeEngine } from "../test/widget.js";

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: PAYER,
    isConnected: true,
    chain: { name: "Base" },
  }),
  useConfig: () => ({}),
  useConnect: () => ({ connectors: [], connectAsync: vi.fn(), reset: vi.fn() }),
  useDisconnect: () => ({ disconnectAsync: vi.fn() }),
}));
vi.mock("@wagmi/core", () => ({
  getChainId: () => 8453,
  switchChain: vi.fn(),
  sendTransaction: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ connected: false, publicKey: null, wallet: null }),
  useConnection: () => ({ connection: {} }),
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

const { WhiskSend } = await import("./WhiskSend.js");

afterEach(cleanup);

const BURNED: InflightRecord = {
  version: 2,
  id: "q-burned",
  network: "mainnet",
  sourceChain: "Base",
  destinationChain: "Arc",
  mint: "forwarder",
  speed: "fast",
  amountBurned: "25000000",
  recipient: RECIPIENT,
  step: "burned",
  sourceTxHash: `0x${"ab".repeat(32)}`,
  createdAt: 1,
  updatedAt: 1,
};

function renderSend() {
  const engine = fakeEngine();
  engine.inflight.mockResolvedValue([BURNED]);
  render(
    <WithWhisk
      engine={engine}
      config={{ chains: ["Base", "Arc"], wallets: [] }}
    >
      <WhiskSend />
    </WithWhisk>,
  );
  return engine;
}

describe("Resume list", () => {
  it("lists a transfer still in flight and resumes it with the destination wallet", async () => {
    const engine = renderSend();
    engine.resume.mockResolvedValue({
      kind: "success",
      finalTxHash: `0x${"cd".repeat(32)}`,
      steps: [],
    });

    const row = await screen.findByRole("group", {
      name: "Transfer in progress",
    });
    expect(row.textContent).toContain("25 USDC");
    expect(row.textContent).toContain("Base → Arc");

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() =>
      expect(engine.resume).toHaveBeenCalledWith(
        BURNED,
        expect.objectContaining({
          destinationAdapter: expect.objectContaining({ kind: "evm" }),
        }),
      ),
    );
    expect(await screen.findByText(/Delivered/)).toBeTruthy();
  });

  it("shows why a resume could not finish", async () => {
    const engine = renderSend();
    engine.resume.mockRejectedValue(
      new RouteUnavailableError(
        "destination_adapter_required",
        "Connect a wallet on Arc to finish this transfer.",
        "evm",
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Connect a wallet on Arc",
    );
  });

  it("dismisses a transfer", async () => {
    const engine = renderSend();
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(engine.dismiss).toHaveBeenCalledWith("q-burned"),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "Transfer in progress" }),
      ).toBeNull(),
    );
  });
});
