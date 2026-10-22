// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PAYER, WithWhisk, fakeEngine } from "../test/widget.js";

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: PAYER,
    isConnected: true,
    chain: { name: "Base" },
  }),
  useConfig: () => ({}),
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

const { WhiskReceipt } = await import("./WhiskReceipt.js");

const BURN = `0x${"ab".repeat(32)}`;

beforeEach(() => {
  // Iris has not seen the burn yet.
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WhiskReceipt", () => {
  it("finishes the transfer from its burn hash", async () => {
    const engine = fakeEngine();
    engine.resumeFromTx.mockResolvedValue({
      kind: "success",
      finalTxHash: `0x${"cd".repeat(32)}`,
      steps: [],
    });
    render(
      <WithWhisk engine={engine}>
        <WhiskReceipt
          sourceChain="Base"
          sourceTxHash={BURN}
          destinationChain="Arc"
        />
      </WithWhisk>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Finish transfer" }),
    );
    await waitFor(() =>
      expect(engine.resumeFromTx).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceChain: "Base",
          txHash: BURN,
          destinationAdapter: expect.objectContaining({ kind: "evm" }),
        }),
      ),
    );
    expect(await screen.findByText(/Delivered/)).toBeTruthy();
  });

  it("shows why the transfer could not be finished", async () => {
    const engine = fakeEngine();
    engine.resumeFromTx.mockRejectedValue(
      new Error("Circle has not seen a burn"),
    );
    render(
      <WithWhisk engine={engine}>
        <WhiskReceipt
          sourceChain="Base"
          sourceTxHash={BURN}
          destinationChain="Arc"
        />
      </WithWhisk>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Finish transfer" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Circle has not seen a burn",
    );
  });
});
