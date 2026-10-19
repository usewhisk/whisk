// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PAYER, RECIPIENT, WithWhisk, fakeEngine } from "../test/widget.js";

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: PAYER,
    isConnected: true,
    chain: { name: "Base" },
  }),
  useConfig: () => ({}),
  useConnect: () => ({ connectors: [], connect: vi.fn(), reset: vi.fn() }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
}));
vi.mock("@wagmi/core", () => ({
  getChainId: () => 8453,
  switchChain: vi.fn(),
  sendTransaction: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));
// The Stellar and Starknet kits only matter inside their providers, which
// these tests do not mount; their CommonJS builds do not load under vitest.
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
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ connected: false, publicKey: null, wallet: null }),
  useConnection: () => ({ connection: {} }),
}));

const { WhiskSend } = await import("./WhiskSend.js");

afterEach(cleanup);

describe("WhiskSend errors", () => {
  it("#89 shows a failed send instead of leaving an unhandled rejection", async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);

    const engine = fakeEngine();
    engine.send.mockRejectedValue(new Error("RPC exploded"));
    render(
      <WithWhisk engine={engine}>
        <WhiskSend defaultRecipient={RECIPIENT} defaultAmount="5" />
      </WithWhisk>,
    );

    const button = await screen.findByRole("button", { name: "Send USDC" });
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(button);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "RPC exploded",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", onRejection);
    expect(rejections).toEqual([]);
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
