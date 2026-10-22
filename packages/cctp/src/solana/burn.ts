/**
 * Solana CCTP V2 `deposit_for_burn` / `deposit_for_burn_with_hook`
 * instruction builder.
 *
 * Account list verified against
 * `circlefin/solana-cctp-contracts/programs/v2/token-messenger-minter-v2`:
 *
 *   1.  owner                        (signer, ro)
 *   2.  event_rent_payer             (signer, writable)
 *   3.  sender_authority_pda         (ro)        PDA["sender_authority"] on TMM
 *   4.  burn_token_account           (writable)  user's USDC ATA
 *   5.  denylist_account             (ro)        PDA["denylist_account", owner] on TMM
 *   6.  message_transmitter          (writable)  PDA["message_transmitter"] on MT
 *   7.  token_messenger              (ro)        PDA["token_messenger"] on TMM
 *   8.  remote_token_messenger       (ro)        PDA["remote_token_messenger", destDomain.toString()] on TMM
 *   9.  token_minter                 (ro)        PDA["token_minter"] on TMM
 *  10.  local_token                  (writable)  PDA["local_token", burnTokenMint] on TMM
 *  11.  burn_token_mint              (writable)
 *  12.  message_sent_event_data      (signer, writable)  fresh keypair, generated client-side
 *  13.  message_transmitter_program  (ro)
 *  14.  token_messenger_minter_program (ro)
 *  15.  token_program                (ro)
 *  16.  system_program               (ro)
 *  17.  event_authority              (ro)        PDA["__event_authority"] on TMM (added by #[event_cpi])
 *  18.  program                      (ro)        TMM program ID (added by #[event_cpi])
 *
 * Encoding (Borsh):
 *   amount:                u64 LE
 *   destination_domain:    u32 LE
 *   mint_recipient:        Pubkey (32 bytes)
 *   destination_caller:    Pubkey (32 bytes)
 *   max_fee:               u64 LE
 *   min_finality_threshold: u32 LE
 *   hook_data:             Vec<u8>   [only for deposit_for_burn_with_hook]
 */
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { SolanaChain } from "../chains/types.js";
import type { FinalityThreshold } from "../iris/types.js";
import { InvalidInputError } from "../errors.js";
import {
  deriveDenylistAccount,
  deriveEventAuthority,
  deriveLocalToken,
  deriveMessageTransmitter,
  deriveRemoteTokenMessenger,
  deriveSenderAuthority,
  deriveTokenMessenger,
  deriveTokenMinter,
} from "./pda.js";
import {
  DISCRIMINATOR_DEPOSIT_FOR_BURN,
  DISCRIMINATOR_DEPOSIT_FOR_BURN_WITH_HOOK,
} from "./discriminators.js";
import {
  createWriter,
  finalize,
  withDiscriminator,
  writeBytes,
  writePubkey,
  writeU32LE,
  writeU64LE,
} from "./borsh.js";

const ANY_DESTINATION_CALLER = new PublicKey(new Uint8Array(32));

export type BuildSolanaBurnIntentInput = {
  source: SolanaChain;
  /** Destination chain CCTP domain (0=Eth, 1=Avax, 3=Arb, 6=Base, etc.). */
  destinationDomain: number;
  /** USDC subunits (6 decimals). Must be > 0 and ≤ 10M USDC. */
  amount: bigint;
  /**
   * Recipient on the destination chain, as 32 bytes (bytes32-encoded).
   * EVM addresses are left-padded; Solana addresses pass through.
   */
  mintRecipientBytes32: Uint8Array;
  /** USDC subunits; caps the protocol + forwarder fees. */
  maxFee: bigint;
  owner: PublicKey;
  /** Fresh keypair pubkey for `message_sent_event_data`. */
  messageSentEventDataKey: PublicKey;
  /** User's USDC ATA on the source chain. */
  ownerUsdcAta: PublicKey;
  /** `destinationCaller` as bytes32. Defaults to any caller. */
  destinationCallerBytes32?: Uint8Array;
  /**
   * Non-empty bytes (the `cctp-forward` hookData, or the Stellar
   * Forwarder's) select `deposit_for_burn_with_hook`. Leave unset for
   * the plain burn.
   */
  hookData?: Uint8Array;
  /** Take it from the fee tier. */
  minFinalityThreshold: FinalityThreshold;
};

export type SolanaInstruction = {
  programId: PublicKey;
  keys: AccountMeta[];
  data: Buffer;
  ecosystem: "solana";
};

export type SolanaBurnIntent = {
  source: SolanaChain;
  destinationDomain: number;
  amount: bigint;
  maxFee: bigint;
  instruction: SolanaInstruction;
  /** Pubkey the caller must include as a fresh signer. */
  messageSentEventDataKey: PublicKey;
  withHook: boolean;
};

/** CCTP per-burn cap: $10M USDC. */
const MAX_USDC_AMOUNT = 10_000_000n * 1_000_000n;

export function buildSolanaBurnIntent(
  input: BuildSolanaBurnIntentInput,
): SolanaBurnIntent {
  if (input.source.ecosystem !== "solana") {
    throw new InvalidInputError(
      "invalid_chain",
      `source must be a Solana chain, got ${input.source.ecosystem}`,
    );
  }
  if (input.amount <= 0n) {
    throw new InvalidInputError(
      "invalid_amount",
      `amount must be positive, got ${input.amount}`,
    );
  }
  if (input.amount > MAX_USDC_AMOUNT) {
    throw new InvalidInputError(
      "amount_too_large",
      `amount exceeds CCTP per-burn cap of 10M USDC`,
    );
  }
  if (input.amount <= input.maxFee) {
    throw new InvalidInputError(
      "invalid_amount",
      "amount must exceed maxFee (program would revert MaxFeeMustBeLessThanAmount)",
    );
  }
  if (input.mintRecipientBytes32.length !== 32) {
    throw new InvalidInputError(
      "invalid_input",
      `mintRecipientBytes32 must be 32 bytes, got ${input.mintRecipientBytes32.length}`,
    );
  }
  const destCaller = input.destinationCallerBytes32 ?? new Uint8Array(32);
  if (destCaller.length !== 32) {
    throw new InvalidInputError(
      "invalid_input",
      `destinationCallerBytes32 must be 32 bytes, got ${destCaller.length}`,
    );
  }
  // Hook data must be non-empty when used (program reverts
  // InvalidHookData on len == 0). Plain burn uses the no-hook variant.
  if (input.hookData !== undefined && input.hookData.length === 0) {
    throw new InvalidInputError(
      "invalid_input",
      "hookData must be non-empty (use the no-hook builder for plain burns)",
    );
  }

  const tmmProgram = new PublicKey(input.source.tokenMessengerMinter);
  const mtProgram = new PublicKey(input.source.messageTransmitter);
  const burnTokenMint = new PublicKey(input.source.usdc);

  const senderAuthorityPda = deriveSenderAuthority(tmmProgram);
  const denylistAccount = deriveDenylistAccount(tmmProgram, input.owner);
  const messageTransmitter = deriveMessageTransmitter(mtProgram);
  const tokenMessenger = deriveTokenMessenger(tmmProgram);
  const remoteTokenMessenger = deriveRemoteTokenMessenger(
    tmmProgram,
    input.destinationDomain,
  );
  const tokenMinter = deriveTokenMinter(tmmProgram);
  const localToken = deriveLocalToken(tmmProgram, burnTokenMint);
  const eventAuthority = deriveEventAuthority(tmmProgram);

  const keys: AccountMeta[] = [
    { pubkey: input.owner, isSigner: true, isWritable: false },
    { pubkey: input.owner, isSigner: true, isWritable: true }, // event_rent_payer = owner
    { pubkey: senderAuthorityPda, isSigner: false, isWritable: false },
    { pubkey: input.ownerUsdcAta, isSigner: false, isWritable: true },
    { pubkey: denylistAccount, isSigner: false, isWritable: false },
    { pubkey: messageTransmitter, isSigner: false, isWritable: true },
    { pubkey: tokenMessenger, isSigner: false, isWritable: false },
    { pubkey: remoteTokenMessenger, isSigner: false, isWritable: false },
    { pubkey: tokenMinter, isSigner: false, isWritable: false },
    { pubkey: localToken, isSigner: false, isWritable: true },
    { pubkey: burnTokenMint, isSigner: false, isWritable: true },
    {
      pubkey: input.messageSentEventDataKey,
      isSigner: true,
      isWritable: true,
    },
    { pubkey: mtProgram, isSigner: false, isWritable: false },
    { pubkey: tmmProgram, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: tmmProgram, isSigner: false, isWritable: false },
  ];

  // Field order matches Rust DepositForBurnParams and
  // DepositForBurnWithHookParams; the hook variant only appends hook_data.
  const writer = createWriter(96);
  writeU64LE(writer, input.amount);
  writeU32LE(writer, input.destinationDomain);
  writePubkey(writer, input.mintRecipientBytes32);
  writePubkey(writer, destCaller);
  writeU64LE(writer, input.maxFee);
  writeU32LE(writer, input.minFinalityThreshold);
  if (input.hookData !== undefined) {
    writeBytes(writer, input.hookData);
  }

  const discriminator =
    input.hookData !== undefined
      ? DISCRIMINATOR_DEPOSIT_FOR_BURN_WITH_HOOK
      : DISCRIMINATOR_DEPOSIT_FOR_BURN;
  const data = withDiscriminator(discriminator, writer);

  return {
    source: input.source,
    destinationDomain: input.destinationDomain,
    amount: input.amount,
    maxFee: input.maxFee,
    messageSentEventDataKey: input.messageSentEventDataKey,
    withHook: input.hookData !== undefined,
    instruction: {
      programId: tmmProgram,
      keys,
      data,
      ecosystem: "solana",
    },
  };
}

/**
 * Convenience: build a `TransactionInstruction` directly from the
 * intent. Most callers will want this; the raw `instruction` shape
 * keeps the type stable across `@solana/web3.js` minor versions.
 */
export function burnIntentToTransactionInstruction(
  intent: SolanaBurnIntent,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: intent.instruction.programId,
    keys: intent.instruction.keys,
    data: intent.instruction.data,
  });
}

export { ANY_DESTINATION_CALLER as SOLANA_ANY_DESTINATION_CALLER };

export { finalize as __finalizeBorshWriter };
