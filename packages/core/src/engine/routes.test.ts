import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair as StellarKeypair } from "@stellar/stellar-sdk";
import {
  Base,
  CCTP_FORWARD_HOOK_DATA,
  Solana,
  Starknet,
  Stellar,
  buildStellarForwarderHookData,
  contractStrkeyToBytes32Hex,
  toBytes32,
  type IrisMessage,
} from "@usewhisk/cctp";
import type { Chain } from "../types/chain.js";
import type { WhiskAdapter } from "./adapter.js";
import { createWhisk } from "./createWhisk.js";
import {
  createFakeEvmWallet,
  createFakeIris,
  createFakeSolanaWallet,
  createFakeStarknetWallet,
  createFakeStellarWallet,
  type DecodedBurn,
  type FakeIris,
} from "../test/harness/index.js";

const EVM_RECIPIENT = "0x0000000000000000000000000000000000000020";
const STELLAR_RECIPIENT = StellarKeypair.random().publicKey();
const STARKNET_RECIPIENT = `0x${"0".repeat(61)}abc`;
const ZERO32: `0x${string}` = `0x${"0".repeat(64)}`;
const NONCE = `0x${"cd".repeat(32)}`;

const word = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");
const u32 = (n: number) => n.toString(16).padStart(8, "0");

function burnMessage(source: number, destination: number): `0x${string}` {
  return `0x${[
    u32(1),
    u32(source),
    u32(destination),
    word(NONCE),
    word("0x0"),
    word("0x0"),
    word("0x0"),
    u32(1000),
    u32(1000),
    u32(1),
    word("0x0"),
    word("0x0"),
    word(5_000_000n.toString(16)),
    word("0x0"),
    word("0x0"),
    word("0x0"),
    word("0x0"),
  ].join("")}`;
}

function attested(source: number, destination: number): IrisMessage {
  return {
    message: burnMessage(source, destination),
    attestation: `0x${"22".repeat(65)}`,
    eventNonce: NONCE,
    status: "complete",
    cctpVersion: 2,
  };
}

const FORWARDED: IrisMessage = {
  ...attested(Base.cctpDomain, 3),
  forwardState: "COMPLETE",
  forwardTxHash: `0x${"ff".repeat(32)}`,
};

let iris: FakeIris;
beforeEach(() => {
  iris = createFakeIris();
  vi.stubGlobal("fetch", () => {
    throw new Error("the engine used the global fetch");
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const engineFor = (source: Chain, destination: Chain) =>
  createWhisk({ chains: [source, destination], fetch: iris.fetch });

function baseWallet() {
  const wallet = createFakeEvmWallet({ chainId: Base.evmChainId });
  wallet.fund(Base.evmChainId, Base.usdc, 100_000_000n);
  return wallet;
}

function solanaAta(owner: string): `0x${string}` {
  const ata = getAssociatedTokenAddressSync(
    new PublicKey(Solana.usdc),
    new PublicKey(owner),
  );
  return `0x${Buffer.from(ata.toBytes()).toString("hex")}`;
}

const STELLAR_FORWARDER = contractStrkeyToBytes32Hex(Stellar.cctpForwarder);

type Route = {
  source: Chain;
  destination: Chain;
  recipient: string;
  sourceAdapter: WhiskAdapter;
  destinationAdapter?: WhiskAdapter;
  message: IrisMessage;
};

async function send(route: Route) {
  const engine = engineFor(route.source, route.destination);
  const quote = await engine.quote({
    sourceChain: route.source,
    destinationChain: route.destination,
    recipient: { address: route.recipient, chain: route.destination },
    amount: "5",
    adapter: route.sourceAdapter,
    ...(route.destinationAdapter && {
      destinationAdapter: route.destinationAdapter,
    }),
  });
  iris.replyToMessages({ message: route.message });
  const result = await engine.send({
    adapter: route.sourceAdapter,
    quote,
    ...(route.destinationAdapter && {
      destinationAdapter: route.destinationAdapter,
    }),
  });
  return { engine, quote, result };
}

async function refusesWithoutDestinationWallet(route: Route) {
  const engine = engineFor(route.source, route.destination);
  const quote = await engine.quote({
    sourceChain: route.source,
    destinationChain: route.destination,
    recipient: { address: route.recipient, chain: route.destination },
    amount: "5",
    adapter: route.sourceAdapter,
    destinationAdapter: route.destinationAdapter!,
  });
  await expect(
    engine.send({ adapter: route.sourceAdapter, quote }),
  ).rejects.toMatchObject({
    code: "ROUTE_UNAVAILABLE",
    reason: "destination_adapter_required",
  });
}

function expectBurn(
  burns: readonly DecodedBurn[],
  expected: Partial<DecodedBurn>,
) {
  expect(burns).toHaveLength(1);
  expect(burns[0]).toMatchObject(expected);
}

describe("EVM source", () => {
  it("EVM to EVM: Circle forwards, fees paid upfront", async () => {
    const wallet = baseWallet();
    const { result } = await send({
      source: "Base",
      destination: "Arbitrum",
      recipient: EVM_RECIPIENT,
      sourceAdapter: wallet.adapter,
      message: FORWARDED,
    });
    expect(result.kind).toBe("success");
    expect(wallet.feeBurns).toHaveLength(1);
    expect(wallet.feeBurns[0]).toMatchObject({
      amount: 5_000_000n,
      destinationDomain: 3,
      mintRecipient: toBytes32(EVM_RECIPIENT),
      destinationCaller: ZERO32,
    });
    expect(iris.quoteRequests[0]?.body.requests).toEqual([
      { type: "FORWARD" },
      { type: "PRE_FINALITY" },
    ]);
  });

  it("EVM to EVM: an expired quote burns nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const wallet = baseWallet();
    const engine = engineFor("Base", "Arbitrum");
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: EVM_RECIPIENT, chain: "Arbitrum" },
      amount: "5",
      adapter: wallet.adapter,
    });
    vi.setSystemTime(Date.now() + 60_001);
    await expect(
      engine.send({ adapter: wallet.adapter, quote }),
    ).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
    expect(wallet.batches).toEqual([]);
  });

  it("EVM to Solana: mints into the recipient's USDC account", async () => {
    const wallet = baseWallet();
    const solana = createFakeSolanaWallet(Solana);
    const route: Route = {
      source: "Base",
      destination: "Solana",
      recipient: solana.address,
      sourceAdapter: wallet.adapter,
      destinationAdapter: solana.adapter,
      message: attested(Base.cctpDomain, Solana.cctpDomain),
    };
    const { result } = await send(route);
    expect(result.kind).toBe("success");
    expect(wallet.feeBurns[0]).toMatchObject({
      destinationDomain: Solana.cctpDomain,
      mintRecipient: solanaAta(solana.address),
      destinationCaller: ZERO32,
    });
    expect(solana.mints).toHaveLength(1);

    const again = baseWallet();
    await refusesWithoutDestinationWallet({
      ...route,
      sourceAdapter: again.adapter,
    });
    expect(again.batches).toEqual([]);
  });

  it("EVM to Stellar: burns to the CctpForwarder with the recipient in hookData", async () => {
    const wallet = baseWallet();
    const stellar = createFakeStellarWallet(Stellar);
    const route: Route = {
      source: "Base",
      destination: "Stellar",
      recipient: STELLAR_RECIPIENT,
      sourceAdapter: wallet.adapter,
      destinationAdapter: stellar.adapter,
      message: attested(Base.cctpDomain, Stellar.cctpDomain),
    };
    const { quote, result } = await send(route);
    expect(result.kind).toBe("success");
    expectBurn(wallet.burns, {
      destinationDomain: Stellar.cctpDomain,
      mintRecipient: STELLAR_FORWARDER,
      destinationCaller: STELLAR_FORWARDER,
      maxFee: quote.subunits.maxFee,
      hookData: buildStellarForwarderHookData(STELLAR_RECIPIENT),
    });
    expect(stellar.invocations).toContain("mint_and_forward");

    const again = baseWallet();
    await refusesWithoutDestinationWallet({
      ...route,
      sourceAdapter: again.adapter,
    });
    expect(again.batches).toEqual([]);
  });

  it("EVM to Starknet: mints with the Starknet wallet", async () => {
    const wallet = baseWallet();
    const starknet = createFakeStarknetWallet(Starknet);
    const route: Route = {
      source: "Base",
      destination: "Starknet",
      recipient: STARKNET_RECIPIENT,
      sourceAdapter: wallet.adapter,
      destinationAdapter: starknet.adapter,
      message: attested(Base.cctpDomain, Starknet.cctpDomain),
    };
    const { result } = await send(route);
    expect(result.kind).toBe("success");
    expect(wallet.feeBurns[0]).toMatchObject({
      destinationDomain: Starknet.cctpDomain,
      mintRecipient: `0x${word(STARKNET_RECIPIENT)}`,
      destinationCaller: ZERO32,
    });
    expect(starknet.entrypoints).toContain("receive_message");

    const again = baseWallet();
    await refusesWithoutDestinationWallet({
      ...route,
      sourceAdapter: again.adapter,
    });
    expect(again.batches).toEqual([]);
  });
});

describe("Solana source", () => {
  it("Solana to EVM: Circle forwards", async () => {
    const solana = createFakeSolanaWallet(Solana);
    const { quote, result } = await send({
      source: "Solana",
      destination: "Base",
      recipient: EVM_RECIPIENT,
      sourceAdapter: solana.adapter,
      message: {
        ...FORWARDED,
        message: burnMessage(Solana.cctpDomain, Base.cctpDomain),
      },
    });
    expect(result.kind).toBe("success");
    expectBurn(solana.burns, {
      amount: quote.subunits.burnAmount,
      destinationDomain: Base.cctpDomain,
      mintRecipient: toBytes32(EVM_RECIPIENT),
      destinationCaller: ZERO32,
      maxFee: quote.subunits.maxFee,
      hookData: CCTP_FORWARD_HOOK_DATA,
    });
  });

  it("Solana to Stellar: burns to the CctpForwarder", async () => {
    const solana = createFakeSolanaWallet(Solana);
    const stellar = createFakeStellarWallet(Stellar);
    const route: Route = {
      source: "Solana",
      destination: "Stellar",
      recipient: STELLAR_RECIPIENT,
      sourceAdapter: solana.adapter,
      destinationAdapter: stellar.adapter,
      message: attested(Solana.cctpDomain, Stellar.cctpDomain),
    };
    const { quote, result } = await send(route);
    expect(result.kind).toBe("success");
    expectBurn(solana.burns, {
      destinationDomain: Stellar.cctpDomain,
      mintRecipient: STELLAR_FORWARDER,
      destinationCaller: STELLAR_FORWARDER,
      maxFee: quote.subunits.maxFee,
      hookData: buildStellarForwarderHookData(STELLAR_RECIPIENT),
    });
    expect(stellar.invocations).toContain("mint_and_forward");

    const again = createFakeSolanaWallet(Solana);
    await refusesWithoutDestinationWallet({
      ...route,
      sourceAdapter: again.adapter,
    });
    expect(again.burns).toEqual([]);
  });

  it("Solana to Starknet: mints with the Starknet wallet", async () => {
    const solana = createFakeSolanaWallet(Solana);
    const starknet = createFakeStarknetWallet(Starknet);
    const route: Route = {
      source: "Solana",
      destination: "Starknet",
      recipient: STARKNET_RECIPIENT,
      sourceAdapter: solana.adapter,
      destinationAdapter: starknet.adapter,
      message: attested(Solana.cctpDomain, Starknet.cctpDomain),
    };
    const { quote, result } = await send(route);
    expect(result.kind).toBe("success");
    expectBurn(solana.burns, {
      destinationDomain: Starknet.cctpDomain,
      mintRecipient: `0x${word(STARKNET_RECIPIENT)}`,
      destinationCaller: ZERO32,
      maxFee: quote.subunits.maxFee,
    });
    expect(starknet.entrypoints).toContain("receive_message");

    const again = createFakeSolanaWallet(Solana);
    await refusesWithoutDestinationWallet({
      ...route,
      sourceAdapter: again.adapter,
    });
    expect(again.burns).toEqual([]);
  });
});

describe("Stellar source", () => {
  it("Stellar to EVM: mints with the EVM wallet", async () => {
    const stellar = createFakeStellarWallet(Stellar);
    const evm = createFakeEvmWallet({ chainId: Base.evmChainId });
    const route: Route = {
      source: "Stellar",
      destination: "Base",
      recipient: EVM_RECIPIENT,
      sourceAdapter: stellar.adapter,
      destinationAdapter: evm.adapter,
      message: attested(Stellar.cctpDomain, Base.cctpDomain),
    };
    const { quote, result } = await send(route);
    expect(result.kind).toBe("success");
    expectBurn(stellar.burns, {
      destinationDomain: Base.cctpDomain,
      mintRecipient: toBytes32(EVM_RECIPIENT),
      destinationCaller: ZERO32,
      maxFee: quote.subunits.maxFee,
    });
    expect(evm.mints.map((m) => m.chainId)).toEqual([Base.evmChainId]);

    const again = createFakeStellarWallet(Stellar);
    await refusesWithoutDestinationWallet({
      ...route,
      sourceAdapter: again.adapter,
    });
    expect(again.burns).toEqual([]);
  });

  it("Stellar to Solana: mints into the recipient's USDC account", async () => {
    const stellar = createFakeStellarWallet(Stellar);
    const solana = createFakeSolanaWallet(Solana);
    const route: Route = {
      source: "Stellar",
      destination: "Solana",
      recipient: solana.address,
      sourceAdapter: stellar.adapter,
      destinationAdapter: solana.adapter,
      message: attested(Stellar.cctpDomain, Solana.cctpDomain),
    };
    const { quote, result } = await send(route);
    expect(result.kind).toBe("success");
    expectBurn(stellar.burns, {
      destinationDomain: Solana.cctpDomain,
      mintRecipient: solanaAta(solana.address),
      destinationCaller: ZERO32,
      maxFee: quote.subunits.maxFee,
    });
    expect(solana.mints).toHaveLength(1);

    const again = createFakeStellarWallet(Stellar);
    await refusesWithoutDestinationWallet({
      ...route,
      sourceAdapter: again.adapter,
    });
    expect(again.burns).toEqual([]);
  });

  it("Stellar to Starknet: mints with the Starknet wallet", async () => {
    const stellar = createFakeStellarWallet(Stellar);
    const starknet = createFakeStarknetWallet(Starknet);
    const route: Route = {
      source: "Stellar",
      destination: "Starknet",
      recipient: STARKNET_RECIPIENT,
      sourceAdapter: stellar.adapter,
      destinationAdapter: starknet.adapter,
      message: attested(Stellar.cctpDomain, Starknet.cctpDomain),
    };
    const { quote, result } = await send(route);
    expect(result.kind).toBe("success");
    expectBurn(stellar.burns, {
      destinationDomain: Starknet.cctpDomain,
      mintRecipient: `0x${word(STARKNET_RECIPIENT)}`,
      destinationCaller: ZERO32,
      maxFee: quote.subunits.maxFee,
    });
    expect(starknet.entrypoints).toContain("receive_message");

    const again = createFakeStellarWallet(Stellar);
    await refusesWithoutDestinationWallet({
      ...route,
      sourceAdapter: again.adapter,
    });
    expect(again.burns).toEqual([]);
  });
});

describe("Starknet source", () => {
  it("Starknet to EVM: mints with the EVM wallet", async () => {
    const starknet = createFakeStarknetWallet(Starknet);
    const evm = createFakeEvmWallet({ chainId: Base.evmChainId });
    const route: Route = {
      source: "Starknet",
      destination: "Base",
      recipient: EVM_RECIPIENT,
      sourceAdapter: starknet.adapter,
      destinationAdapter: evm.adapter,
      message: attested(Starknet.cctpDomain, Base.cctpDomain),
    };
    const { quote, result } = await send(route);
    expect(result.kind).toBe("success");
    expectBurn(starknet.burns, {
      destinationDomain: Base.cctpDomain,
      mintRecipient: toBytes32(EVM_RECIPIENT),
      destinationCaller: ZERO32,
      maxFee: quote.subunits.maxFee,
    });
    expect(evm.mints.map((m) => m.chainId)).toEqual([Base.evmChainId]);

    const again = createFakeStarknetWallet(Starknet);
    await refusesWithoutDestinationWallet({
      ...route,
      sourceAdapter: again.adapter,
    });
    expect(again.burns).toEqual([]);
  });

  it("Starknet to Solana: mints into the recipient's USDC account", async () => {
    const starknet = createFakeStarknetWallet(Starknet);
    const solana = createFakeSolanaWallet(Solana);
    const route: Route = {
      source: "Starknet",
      destination: "Solana",
      recipient: solana.address,
      sourceAdapter: starknet.adapter,
      destinationAdapter: solana.adapter,
      message: attested(Starknet.cctpDomain, Solana.cctpDomain),
    };
    const { quote, result } = await send(route);
    expect(result.kind).toBe("success");
    expectBurn(starknet.burns, {
      destinationDomain: Solana.cctpDomain,
      mintRecipient: solanaAta(solana.address),
      destinationCaller: ZERO32,
      maxFee: quote.subunits.maxFee,
    });
    expect(solana.mints).toHaveLength(1);

    const again = createFakeStarknetWallet(Starknet);
    await refusesWithoutDestinationWallet({
      ...route,
      sourceAdapter: again.adapter,
    });
    expect(again.burns).toEqual([]);
  });

  it("Starknet to Stellar: burns to the CctpForwarder", async () => {
    const starknet = createFakeStarknetWallet(Starknet);
    const stellar = createFakeStellarWallet(Stellar);
    const route: Route = {
      source: "Starknet",
      destination: "Stellar",
      recipient: STELLAR_RECIPIENT,
      sourceAdapter: starknet.adapter,
      destinationAdapter: stellar.adapter,
      message: attested(Starknet.cctpDomain, Stellar.cctpDomain),
    };
    const { quote, result } = await send(route);
    expect(result.kind).toBe("success");
    expectBurn(starknet.burns, {
      destinationDomain: Stellar.cctpDomain,
      mintRecipient: STELLAR_FORWARDER,
      destinationCaller: STELLAR_FORWARDER,
      maxFee: quote.subunits.maxFee,
    });
    expect(stellar.invocations).toContain("mint_and_forward");

    const again = createFakeStarknetWallet(Starknet);
    await refusesWithoutDestinationWallet({
      ...route,
      sourceAdapter: again.adapter,
    });
    expect(again.burns).toEqual([]);
  });
});
