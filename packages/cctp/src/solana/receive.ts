/**
 * Solana CCTP V2 `receive_message` instruction builder.
 *
 * `receive_message` is dispatched on `MessageTransmitterV2`. It does
 * its own attestation verification, opens a `used_nonce` PDA, then
 * CPIs into the receiver program (TokenMessengerMinterV2) via
 * `handle_receive_finalized_message`. All accounts the receiver needs
 * are appended after MessageTransmitter's own.
 *
 * Account list verified against
 * `circlefin/solana-cctp-contracts/programs/v2`:
 *
 * MessageTransmitterV2 — ReceiveMessageContext (with #[event_cpi]):
 *   1.  payer                           (signer, writable)
 *   2.  caller                          (signer, ro)
 *   3.  authority_pda                   (ro)
 *   4.  message_transmitter             (ro)
 *   5.  used_nonce                      (writable, init)
 *   6.  receiver                        (ro)  TMM program
 *   7.  system_program                  (ro)
 *   8.  event_authority (MT)            (ro)
 *   9.  program (MT)                    (ro)
 *
 * Remaining accounts — TokenMessengerMinterV2's
 * HandleReceiveMessageContext (with #[event_cpi]):
 *  10.  token_messenger                 (ro)
 *  11.  remote_token_messenger          (ro)
 *  12.  token_minter                    (writable)
 *  13.  local_token                     (writable)
 *  14.  token_pair                      (ro)
 *  15.  fee_recipient_token_account     (writable)
 *  16.  recipient_token_account         (writable)
 *  17.  custody_token_account           (writable)
 *  18.  token_program                   (ro)
 *  19.  event_authority (TMM)           (ro)
 *  20.  program (TMM)                   (ro)
 */
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { SolanaCctpChain } from "../chains/types.js";
import { InvalidInputError } from "../errors.js";
import {
  deriveCustodyTokenAccount,
  deriveEventAuthority,
  deriveLocalToken,
  deriveMessageTransmitter,
  deriveMessageTransmitterAuthority,
  deriveRemoteTokenMessenger,
  deriveTokenMessenger,
  deriveTokenMinter,
  deriveTokenPair,
  deriveUsedNonce,
} from "./pda.js";
import { DISCRIMINATOR_RECEIVE_MESSAGE } from "./discriminators.js";
import { createWriter, withDiscriminator, writeBytes } from "./borsh.js";

export type BuildSolanaReceiveIntentInput = {
  destination: SolanaCctpChain;
  /** Raw CCTP message bytes from Iris. */
  message: Uint8Array;
  /** Raw attestation bytes from Iris. */
  attestation: Uint8Array;
  /** Source CCTP domain (the chain the burn came from). */
  sourceDomain: number;
  /** Source-chain USDC token, 32-byte left-padded. */
  sourceTokenBytes32: Uint8Array;
  /** Mint fee recipient — pulled from the on-chain TokenMessenger state. */
  feeRecipientUsdcAta: PublicKey;
  /** End-recipient's USDC ATA on Solana. Must be pre-created. */
  recipientUsdcAta: PublicKey;
  /**
   * Pays + signs the receiveMessage tx. `caller` is the same signer
   * unless the merchant runs a separate relayer setup.
   */
  payer: PublicKey;
};

export type SolanaReceiveIntent = {
  destination: SolanaCctpChain;
  instruction: {
    programId: PublicKey;
    keys: AccountMeta[];
    data: Buffer;
    ecosystem: "solana";
  };
};

export function buildSolanaReceiveIntent(
  input: BuildSolanaReceiveIntentInput,
): SolanaReceiveIntent {
  if (input.destination.ecosystem !== "solana") {
    throw new InvalidInputError(
      "invalid_chain",
      `destination must be a Solana chain, got ${input.destination.ecosystem}`,
    );
  }
  if (input.message.length < 44) {
    throw new InvalidInputError(
      "invalid_input",
      `message must be at least 44 bytes (Iris messages are much larger), got ${input.message.length}`,
    );
  }
  if (input.attestation.length === 0) {
    throw new InvalidInputError(
      "invalid_input",
      "attestation must not be empty",
    );
  }
  if (input.sourceTokenBytes32.length !== 32) {
    throw new InvalidInputError(
      "invalid_input",
      `sourceTokenBytes32 must be 32 bytes, got ${input.sourceTokenBytes32.length}`,
    );
  }

  const tmmProgram = new PublicKey(input.destination.tokenMessengerMinter);
  const mtProgram = new PublicKey(input.destination.messageTransmitter);
  const localMint = new PublicKey(input.destination.usdc);

  // MT-side PDAs
  const authorityPda = deriveMessageTransmitterAuthority(mtProgram, tmmProgram);
  const messageTransmitter = deriveMessageTransmitter(mtProgram);
  const usedNonce = deriveUsedNonce(mtProgram, input.message);
  const mtEventAuthority = deriveEventAuthority(mtProgram);

  // TMM-side PDAs (CPI accounts)
  const tokenMessenger = deriveTokenMessenger(tmmProgram);
  const remoteTokenMessenger = deriveRemoteTokenMessenger(
    tmmProgram,
    input.sourceDomain,
  );
  const tokenMinter = deriveTokenMinter(tmmProgram);
  const localToken = deriveLocalToken(tmmProgram, localMint);
  const tokenPair = deriveTokenPair(
    tmmProgram,
    input.sourceDomain,
    input.sourceTokenBytes32,
  );
  const custodyTokenAccount = deriveCustodyTokenAccount(tmmProgram, localMint);
  const tmmEventAuthority = deriveEventAuthority(tmmProgram);

  const keys: AccountMeta[] = [
    { pubkey: input.payer, isSigner: true, isWritable: true },
    { pubkey: input.payer, isSigner: true, isWritable: false }, // caller = payer
    { pubkey: authorityPda, isSigner: false, isWritable: false },
    { pubkey: messageTransmitter, isSigner: false, isWritable: false },
    { pubkey: usedNonce, isSigner: false, isWritable: true },
    { pubkey: tmmProgram, isSigner: false, isWritable: false }, // receiver
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: mtEventAuthority, isSigner: false, isWritable: false },
    { pubkey: mtProgram, isSigner: false, isWritable: false },
    // Remaining accounts for TMM handle_receive
    { pubkey: tokenMessenger, isSigner: false, isWritable: false },
    { pubkey: remoteTokenMessenger, isSigner: false, isWritable: false },
    { pubkey: tokenMinter, isSigner: false, isWritable: true },
    { pubkey: localToken, isSigner: false, isWritable: true },
    { pubkey: tokenPair, isSigner: false, isWritable: false },
    { pubkey: input.feeRecipientUsdcAta, isSigner: false, isWritable: true },
    { pubkey: input.recipientUsdcAta, isSigner: false, isWritable: true },
    { pubkey: custodyTokenAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: tmmEventAuthority, isSigner: false, isWritable: false },
    { pubkey: tmmProgram, isSigner: false, isWritable: false },
  ];

  // ReceiveMessageParams: { message: Vec<u8>, attestation: Vec<u8> }
  const writer = createWriter(
    input.message.length + input.attestation.length + 16,
  );
  writeBytes(writer, input.message);
  writeBytes(writer, input.attestation);
  const data = withDiscriminator(DISCRIMINATOR_RECEIVE_MESSAGE, writer);

  return {
    destination: input.destination,
    instruction: {
      programId: mtProgram,
      keys,
      data,
      ecosystem: "solana",
    },
  };
}

/** Convenience: produce a `TransactionInstruction` from the intent. */
export function receiveIntentToTransactionInstruction(
  intent: SolanaReceiveIntent,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: intent.instruction.programId,
    keys: intent.instruction.keys,
    data: intent.instruction.data,
  });
}
