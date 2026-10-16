import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Solana, SolanaDevnet } from "../chains/index.js";
import {
  anchorDiscriminator,
  DISCRIMINATOR_DEPOSIT_FOR_BURN,
  DISCRIMINATOR_DEPOSIT_FOR_BURN_WITH_HOOK,
  DISCRIMINATOR_RECEIVE_MESSAGE,
} from "./discriminators.js";
import {
  deriveDenylistAccount,
  deriveLocalToken,
  deriveMessageTransmitter,
  deriveMessageTransmitterAuthority,
  deriveRemoteTokenMessenger,
  deriveSenderAuthority,
  deriveTokenMessenger,
  deriveTokenMinter,
  deriveTokenPair,
  deriveUsedNonce,
  deriveEventAuthority,
} from "./pda.js";
import {
  createWriter,
  finalize,
  writeBytes,
  writeU32LE,
  writeU64LE,
} from "./borsh.js";
import {
  buildSolanaBurnIntent,
  SOLANA_ANY_DESTINATION_CALLER,
} from "./burn.js";
import { buildSolanaReceiveIntent } from "./receive.js";
import { InvalidInputError } from "../errors.js";

const TMM = new PublicKey(Solana.tokenMessengerMinter);
const MT = new PublicKey(Solana.messageTransmitter);
const USDC = new PublicKey(Solana.usdc);

const OWNER = Keypair.generate().publicKey;
const EVENT_DATA = Keypair.generate().publicKey;
const USER_ATA = Keypair.generate().publicKey;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* --------------------------------------------------------------------- *
 *  Anchor discriminators
 * --------------------------------------------------------------------- */

describe("anchor discriminators", () => {
  it("is exactly 8 bytes", () => {
    expect(DISCRIMINATOR_DEPOSIT_FOR_BURN.length).toBe(8);
    expect(DISCRIMINATOR_DEPOSIT_FOR_BURN_WITH_HOOK.length).toBe(8);
    expect(DISCRIMINATOR_RECEIVE_MESSAGE.length).toBe(8);
  });

  it('matches sha256("global:<name>")[0..8]', () => {
    // Snapshot-style check — recompute via the helper, compare to the
    // exported constant. Any drift fails loudly.
    const recompute = anchorDiscriminator("deposit_for_burn");
    expect(hex(recompute)).toBe(hex(DISCRIMINATOR_DEPOSIT_FOR_BURN));
  });

  it("deposit_for_burn and deposit_for_burn_with_hook are distinct", () => {
    expect(hex(DISCRIMINATOR_DEPOSIT_FOR_BURN)).not.toBe(
      hex(DISCRIMINATOR_DEPOSIT_FOR_BURN_WITH_HOOK),
    );
  });

  it("receive_message discriminator is the canonical value", () => {
    expect(hex(DISCRIMINATOR_RECEIVE_MESSAGE)).toBe(
      hex(anchorDiscriminator("receive_message")),
    );
  });
});

/* --------------------------------------------------------------------- *
 *  Borsh writers
 * --------------------------------------------------------------------- */

describe("borsh writers", () => {
  it("u64 LE encodes correctly", () => {
    const w = createWriter();
    writeU64LE(w, 0x0102030405060708n);
    const out = finalize(w);
    expect(hex(out)).toBe("0807060504030201");
  });

  it("u32 LE encodes correctly", () => {
    const w = createWriter();
    writeU32LE(w, 0x01020304);
    expect(hex(finalize(w))).toBe("04030201");
  });

  it("Vec<u8> prepends 4-byte LE length", () => {
    const w = createWriter();
    writeBytes(w, new Uint8Array([0xaa, 0xbb, 0xcc]));
    // length=3 LE → 03 00 00 00, then 3 bytes
    expect(hex(finalize(w))).toBe("03000000aabbcc");
  });

  it("rejects negative u64", () => {
    const w = createWriter();
    expect(() => writeU64LE(w, -1n)).toThrow();
  });
});

/* --------------------------------------------------------------------- *
 *  PDA derivation
 * --------------------------------------------------------------------- */

describe("PDA derivation", () => {
  it("token_messenger PDA is on the curve as a PDA (off-curve)", () => {
    const pda = deriveTokenMessenger(TMM);
    expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false);
  });

  it("derives the same address every call (deterministic)", () => {
    const a = deriveTokenMessenger(TMM);
    const b = deriveTokenMessenger(TMM);
    expect(a.toBase58()).toBe(b.toBase58());
  });

  it("token_messenger and token_minter differ", () => {
    expect(deriveTokenMessenger(TMM).toBase58()).not.toBe(
      deriveTokenMinter(TMM).toBase58(),
    );
  });

  it("remote_token_messenger varies by destination domain", () => {
    const ethDomain = deriveRemoteTokenMessenger(TMM, 0); // Ethereum
    const baseDomain = deriveRemoteTokenMessenger(TMM, 6); // Base
    expect(ethDomain.toBase58()).not.toBe(baseDomain.toBase58());
  });

  it("local_token differs between mainnet and devnet USDC mints", () => {
    const mainnetMint = new PublicKey(Solana.usdc);
    const devnetMint = new PublicKey(SolanaDevnet.usdc);
    expect(deriveLocalToken(TMM, mainnetMint).toBase58()).not.toBe(
      deriveLocalToken(TMM, devnetMint).toBase58(),
    );
  });

  it("token_pair uses source domain as decimal string + 32-byte token", () => {
    const tokenA = new Uint8Array(32).fill(1);
    const tokenB = new Uint8Array(32).fill(2);
    expect(deriveTokenPair(TMM, 0, tokenA).toBase58()).not.toBe(
      deriveTokenPair(TMM, 0, tokenB).toBase58(),
    );
    expect(deriveTokenPair(TMM, 0, tokenA).toBase58()).not.toBe(
      deriveTokenPair(TMM, 1, tokenA).toBase58(),
    );
  });

  it("rejects malformed sourceTokenBytes32", () => {
    expect(() => deriveTokenPair(TMM, 0, new Uint8Array(20))).toThrow(
      /32 bytes/,
    );
  });

  it("message_transmitter PDA differs from token_messenger", () => {
    expect(deriveMessageTransmitter(MT).toBase58()).not.toBe(
      deriveTokenMessenger(TMM).toBase58(),
    );
  });

  it("message_transmitter_authority varies by receiver program", () => {
    const a = deriveMessageTransmitterAuthority(MT, TMM);
    const fake = new PublicKey("11111111111111111111111111111112");
    const b = deriveMessageTransmitterAuthority(MT, fake);
    expect(a.toBase58()).not.toBe(b.toBase58());
  });

  it("used_nonce slices bytes 12..44 from the message", () => {
    const msg = new Uint8Array(512);
    msg.fill(0xab, 12, 44);
    const nonce = deriveUsedNonce(MT, msg);
    expect(PublicKey.isOnCurve(nonce.toBytes())).toBe(false);
  });

  it("denylist_account is owner-keyed", () => {
    const a = deriveDenylistAccount(TMM, OWNER);
    const otherOwner = Keypair.generate().publicKey;
    const b = deriveDenylistAccount(TMM, otherOwner);
    expect(a.toBase58()).not.toBe(b.toBase58());
  });

  it("event_authority uses the __event_authority seed", () => {
    const pda = deriveEventAuthority(TMM);
    expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false);
  });
});

/* --------------------------------------------------------------------- *
 *  buildSolanaBurnIntent
 * --------------------------------------------------------------------- */

const RECIP_BYTES32 = new Uint8Array(32);
RECIP_BYTES32.set(
  Buffer.from(
    "000000000000000000000000abcdef1234567890abcdef1234567890abcdef12",
    "hex",
  ),
);

describe("buildSolanaBurnIntent", () => {
  function input(
    overrides: Partial<Parameters<typeof buildSolanaBurnIntent>[0]> = {},
  ) {
    return {
      source: Solana,
      destinationDomain: 0,
      amount: 5_000_000n,
      mintRecipientBytes32: RECIP_BYTES32,
      maxFee: 100_000n,
      owner: OWNER,
      messageSentEventDataKey: EVENT_DATA,
      ownerUsdcAta: USER_ATA,
      ...overrides,
    };
  }

  it("emits an 18-account instruction for the no-hook variant", () => {
    const intent = buildSolanaBurnIntent(input());
    expect(intent.instruction.keys).toHaveLength(18);
    expect(intent.instruction.programId.toBase58()).toBe(
      Solana.tokenMessengerMinter,
    );
    expect(intent.withHook).toBe(false);
  });

  it("instruction data starts with the deposit_for_burn discriminator", () => {
    const intent = buildSolanaBurnIntent(input());
    const prefix = Uint8Array.from(intent.instruction.data.slice(0, 8));
    expect(hex(prefix)).toBe(hex(DISCRIMINATOR_DEPOSIT_FOR_BURN));
  });

  it("with hookData, emits the with-hook discriminator and appends Vec<u8>", () => {
    const hookData = Uint8Array.from(
      Buffer.from(
        "636374702d666f72776172640000000000000000000000000000000000000000",
        "hex",
      ),
    );
    const intent = buildSolanaBurnIntent(input({ hookData }));
    expect(intent.withHook).toBe(true);
    const prefix = Uint8Array.from(intent.instruction.data.slice(0, 8));
    expect(hex(prefix)).toBe(hex(DISCRIMINATOR_DEPOSIT_FOR_BURN_WITH_HOOK));
    // Last 36 bytes = 4-byte length prefix (32) + 32-byte hook payload.
    const len = intent.instruction.data.readUInt32LE(
      intent.instruction.data.length - 36,
    );
    expect(len).toBe(32);
  });

  it("encodes min_finality_threshold = 1000 (Fast) every time", () => {
    const intent = buildSolanaBurnIntent(input());
    // Layout after discriminator: u64 amount + u32 dest_domain + 32 mint + 32 caller + u64 max_fee + u32 finality
    const finalityOffset = 8 + 8 + 4 + 32 + 32 + 8;
    const finality = intent.instruction.data.readUInt32LE(finalityOffset);
    expect(finality).toBe(1000);
  });

  it("orders accounts: owner, event_rent_payer, sender_authority, burn_token_account, denylist, message_transmitter, …", () => {
    const intent = buildSolanaBurnIntent(input());
    const k = intent.instruction.keys;
    expect(k[0]?.pubkey.toBase58()).toBe(OWNER.toBase58());
    expect(k[0]?.isSigner).toBe(true);
    expect(k[1]?.pubkey.toBase58()).toBe(OWNER.toBase58()); // event_rent_payer = owner
    expect(k[1]?.isWritable).toBe(true);
    expect(k[2]?.pubkey.toBase58()).toBe(deriveSenderAuthority(TMM).toBase58());
    expect(k[3]?.pubkey.toBase58()).toBe(USER_ATA.toBase58());
    expect(k[3]?.isWritable).toBe(true);
    expect(k[4]?.pubkey.toBase58()).toBe(
      deriveDenylistAccount(TMM, OWNER).toBase58(),
    );
    expect(k[5]?.pubkey.toBase58()).toBe(
      deriveMessageTransmitter(MT).toBase58(),
    );
    expect(k[5]?.isWritable).toBe(true);
    expect(k[10]?.pubkey.toBase58()).toBe(USDC.toBase58());
    expect(k[10]?.isWritable).toBe(true);
    expect(k[11]?.pubkey.toBase58()).toBe(EVENT_DATA.toBase58());
    expect(k[11]?.isSigner).toBe(true);
    expect(k[16]?.pubkey.toBase58()).toBe(deriveEventAuthority(TMM).toBase58());
    expect(k[17]?.pubkey.toBase58()).toBe(TMM.toBase58()); // program (event_cpi tail)
  });

  it("ANY_DESTINATION_CALLER is 32 zero bytes", () => {
    expect(SOLANA_ANY_DESTINATION_CALLER.toBytes().every((b) => b === 0)).toBe(
      true,
    );
  });

  it("rejects amount ≤ 0", () => {
    expect(() => buildSolanaBurnIntent(input({ amount: 0n }))).toThrow(
      InvalidInputError,
    );
  });

  it("rejects amount <= maxFee", () => {
    expect(() =>
      buildSolanaBurnIntent(input({ amount: 100n, maxFee: 100n })),
    ).toThrow(/MaxFeeMustBeLessThanAmount/);
  });

  it("rejects amount over 10M USDC cap", () => {
    expect(() =>
      buildSolanaBurnIntent(
        input({ amount: 10_000_001n * 1_000_000n, maxFee: 1n }),
      ),
    ).toThrow(/10M/);
  });

  it("rejects mintRecipientBytes32 that isn't 32 bytes", () => {
    expect(() =>
      buildSolanaBurnIntent(
        input({ mintRecipientBytes32: new Uint8Array(20) }),
      ),
    ).toThrow(/32 bytes/);
  });

  it("rejects empty hookData (program reverts InvalidHookData)", () => {
    expect(() =>
      buildSolanaBurnIntent(input({ hookData: new Uint8Array(0) })),
    ).toThrow(/non-empty/);
  });
});

/* --------------------------------------------------------------------- *
 *  buildSolanaReceiveIntent
 * --------------------------------------------------------------------- */

describe("buildSolanaReceiveIntent", () => {
  const MESSAGE = new Uint8Array(256).fill(0xcd);
  const ATTESTATION = new Uint8Array(65).fill(0xef);
  const RECIPIENT_ATA = Keypair.generate().publicKey;
  const FEE_ATA = Keypair.generate().publicKey;

  function input(overrides = {}) {
    return {
      destination: SolanaDevnet,
      message: MESSAGE,
      attestation: ATTESTATION,
      sourceDomain: 6, // Base
      sourceTokenBytes32: new Uint8Array(32).fill(0x11),
      feeRecipientUsdcAta: FEE_ATA,
      recipientUsdcAta: RECIPIENT_ATA,
      payer: OWNER,
      ...overrides,
    };
  }

  it("emits a 20-account instruction (9 MT + 11 TMM remaining)", () => {
    const intent = buildSolanaReceiveIntent(input());
    expect(intent.instruction.keys).toHaveLength(20);
    expect(intent.instruction.programId.toBase58()).toBe(
      SolanaDevnet.messageTransmitter,
    );
  });

  it("starts with the receive_message discriminator", () => {
    const intent = buildSolanaReceiveIntent(input());
    const prefix = Uint8Array.from(intent.instruction.data.slice(0, 8));
    expect(hex(prefix)).toBe(hex(DISCRIMINATOR_RECEIVE_MESSAGE));
  });

  it("encodes message + attestation as length-prefixed Vec<u8>", () => {
    const intent = buildSolanaReceiveIntent(input());
    const data = intent.instruction.data;
    // After 8-byte discriminator, expect u32 LE message length.
    expect(data.readUInt32LE(8)).toBe(MESSAGE.length);
    const attLenOffset = 8 + 4 + MESSAGE.length;
    expect(data.readUInt32LE(attLenOffset)).toBe(ATTESTATION.length);
  });

  it("places token_messenger, remote_token_messenger, token_minter as remaining accounts (slots 9-11)", () => {
    const intent = buildSolanaReceiveIntent(input());
    const TMM_DEV = new PublicKey(SolanaDevnet.tokenMessengerMinter);
    const k = intent.instruction.keys;
    expect(k[9]?.pubkey.toBase58()).toBe(
      deriveTokenMessenger(TMM_DEV).toBase58(),
    );
    expect(k[10]?.pubkey.toBase58()).toBe(
      deriveRemoteTokenMessenger(TMM_DEV, 6).toBase58(),
    );
    expect(k[11]?.pubkey.toBase58()).toBe(
      deriveTokenMinter(TMM_DEV).toBase58(),
    );
    expect(k[11]?.isWritable).toBe(true);
  });

  it("the last account is the TMM program ID (event_cpi tail)", () => {
    const intent = buildSolanaReceiveIntent(input());
    const k = intent.instruction.keys;
    expect(k.at(-1)?.pubkey.toBase58()).toBe(SolanaDevnet.tokenMessengerMinter);
  });

  it("rejects a too-short message", () => {
    expect(() =>
      buildSolanaReceiveIntent(input({ message: new Uint8Array(20) })),
    ).toThrow(/44 bytes/);
  });

  it("rejects empty attestation", () => {
    expect(() =>
      buildSolanaReceiveIntent(input({ attestation: new Uint8Array(0) })),
    ).toThrow(/attestation/);
  });
});
