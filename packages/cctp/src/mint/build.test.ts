import { describe, expect, it } from "vitest";
import {
  Arbitrum,
  Base,
  BaseSepolia,
  Solana,
  Starknet,
  Stellar,
} from "../chains/index.js";
import { InvalidInputError, UnsupportedError } from "../errors.js";
import { buildMintIntent } from "./index.js";

const MESSAGE = "0x" + "ab".repeat(32);
const ATTESTATION = "0x" + "cd".repeat(65);

describe("buildMintIntent", () => {
  it("encodes a receiveMessage call to the destination MessageTransmitterV2", () => {
    const intent = buildMintIntent({
      destination: Arbitrum,
      message: MESSAGE as `0x${string}`,
      attestation: ATTESTATION as `0x${string}`,
    });
    expect(intent.call.to).toBe(Arbitrum.messageTransmitter);
    expect(intent.call.value).toBe(0n);
    expect(intent.call.data).toMatch(/^0x[a-fA-F0-9]+$/);
  });

  it("uses testnet MessageTransmitter on testnet chains", () => {
    const intent = buildMintIntent({
      destination: BaseSepolia,
      message: MESSAGE as `0x${string}`,
      attestation: ATTESTATION as `0x${string}`,
    });
    expect(intent.call.to).toBe(BaseSepolia.messageTransmitter);
  });

  it("encodes deterministically for the same inputs", () => {
    const a = buildMintIntent({
      destination: Base,
      message: MESSAGE as `0x${string}`,
      attestation: ATTESTATION as `0x${string}`,
    });
    const b = buildMintIntent({
      destination: Base,
      message: MESSAGE as `0x${string}`,
      attestation: ATTESTATION as `0x${string}`,
    });
    expect(a.call.data).toBe(b.call.data);
  });

  it("rejects non-hex message", () => {
    expect(() =>
      buildMintIntent({
        destination: Arbitrum,
        message: "not-hex" as `0x${string}`,
        attestation: ATTESTATION as `0x${string}`,
      }),
    ).toThrow(InvalidInputError);
  });

  it("rejects non-hex attestation", () => {
    expect(() =>
      buildMintIntent({
        destination: Arbitrum,
        message: MESSAGE as `0x${string}`,
        attestation: "0xZZ" as `0x${string}`,
      }),
    ).toThrow(InvalidInputError);
  });

  it("rejects missing 0x prefix", () => {
    expect(() =>
      buildMintIntent({
        destination: Arbitrum,
        message: "abcd" as unknown as `0x${string}`,
        attestation: ATTESTATION as `0x${string}`,
      }),
    ).toThrow(InvalidInputError);
  });

  it("throws UnsupportedError on non-EVM destination", () => {
    const fakeSolana = {
      ...Base,
      ecosystem: "solana",
    } as unknown as typeof Base;
    expect(() =>
      buildMintIntent({
        destination: fakeSolana,
        message: MESSAGE as `0x${string}`,
        attestation: ATTESTATION as `0x${string}`,
      }),
    ).toThrow(UnsupportedError);
  });

  it.each([
    { chain: Solana, builder: "buildSolanaReceiveIntent" },
    { chain: Stellar, builder: "buildStellarMintIntent" },
    { chain: Starknet, builder: "buildStarknetReceiveIntent" },
  ])("points a $chain.id mint at $builder", ({ chain, builder }) => {
    expect(() =>
      buildMintIntent({
        destination: chain as unknown as typeof Base,
        message: MESSAGE as `0x${string}`,
        attestation: ATTESTATION as `0x${string}`,
      }),
    ).toThrow(builder);
  });
});
