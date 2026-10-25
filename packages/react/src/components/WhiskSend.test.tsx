// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { RouteUnavailableError, UserRejectedError } from "@usewhisk/core";
import {
  PAYER,
  RECIPIENT,
  WithWhisk,
  fakeEngine,
  sameChainQuote,
} from "../test/widget.js";

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

describe("WhiskSend balance", () => {
  it("says when the transfer went through but the merchant fee was not paid", async () => {
    const engine = fakeEngine();
    engine.send.mockResolvedValue({
      kind: "success",
      finalTxHash: `0x${"ab".repeat(32)}`,
      steps: [],
      customFee: {
        status: "unpaid",
        amount: "1",
        error: new UserRejectedError(),
      },
    });
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
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Sent.");
    expect(status.textContent).toContain("The 1 USDC fee was not paid");
    expect(status.textContent).toContain("User rejected");
  });

  it("shows the payer's USDC and fills Max from the engine", async () => {
    const engine = fakeEngine();
    engine.balance.mockResolvedValue(12_500_000n);
    engine.maxSendable.mockResolvedValue({
      amount: "12.4975",
      balance: 12_500_000n,
      gasReserve: 2_500n,
    });
    render(
      <WithWhisk engine={engine}>
        <WhiskSend defaultRecipient={RECIPIENT} />
      </WithWhisk>,
    );

    expect(await screen.findByText("Balance 12.5 USDC")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    await waitFor(() =>
      expect(
        (screen.getByPlaceholderText("0.00") as HTMLInputElement).value,
      ).toBe("12.4975"),
    );
    expect(engine.maxSendable).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceChain: "Base",
        destinationChain: "Base",
      }),
    );
  });
});

describe("WhiskSend undeployed Starknet recipient", () => {
  it("asks the payer to confirm the address before it quotes", async () => {
    const engine = fakeEngine();
    engine.quote.mockImplementation(
      async (params: {
        amount: string;
        allowUndeployedRecipient?: boolean;
      }) => {
        if (!params.allowUndeployedRecipient) {
          throw new RouteUnavailableError(
            "recipient_not_deployed",
            "No Starknet account is deployed at this address.",
            "starknet",
          );
        }
        return sameChainQuote(params.amount);
      },
    );
    render(
      <WithWhisk engine={engine}>
        <WhiskSend defaultRecipient={RECIPIENT} defaultAmount="5" />
      </WithWhisk>,
    );

    const send = await screen.findByRole("button", { name: "Send USDC" });
    const confirm = await screen.findByRole("button", {
      name: "It's my wallet, continue",
    });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(confirm);
    await waitFor(() =>
      expect((send as HTMLButtonElement).disabled).toBe(false),
    );
    expect(engine.quote).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recipient: expect.objectContaining({ address: RECIPIENT }),
        allowUndeployedRecipient: true,
      }),
    );
    expect(
      screen.queryByRole("button", { name: "It's my wallet, continue" }),
    ).toBeNull();
  });
});
