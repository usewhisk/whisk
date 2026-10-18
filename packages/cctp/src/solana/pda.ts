/**
 * Program-Derived Address (PDA) helpers for CCTP V2 on Solana.
 *
 * Seed conventions verified against Circle's
 * `circlefin/solana-cctp-contracts` (programs/v2). Two key gotchas:
 *
 *   - `remote_token_messenger` uses the destination domain encoded as
 *     its *decimal string* bytes, NOT u32 LE. So domain 0 →
 *     `Buffer.from("0", "utf8")`, not `Buffer.from([0, 0, 0, 0])`.
 *   - `token_pair` uses the source domain as decimal string too,
 *     plus the 32-byte source-token pubkey (left-padded EVM address
 *     for non-Solana sources).
 */
import { PublicKey } from "@solana/web3.js";

const enc = new TextEncoder();

/** Seed prefix bytes for each PDA we need. */
const SEEDS = {
  tokenMessenger: enc.encode("token_messenger"),
  tokenMinter: enc.encode("token_minter"),
  senderAuthority: enc.encode("sender_authority"),
  remoteTokenMessenger: enc.encode("remote_token_messenger"),
  localToken: enc.encode("local_token"),
  tokenPair: enc.encode("token_pair"),
  custody: enc.encode("custody"),
  denylistAccount: enc.encode("denylist_account"),
  messageTransmitter: enc.encode("message_transmitter"),
  messageTransmitterAuthority: enc.encode("message_transmitter_authority"),
  usedNonce: enc.encode("used_nonce"),
  eventAuthority: enc.encode("__event_authority"),
} as const;

/** `token_messenger` PDA on the TokenMessengerMinter program. */
export function deriveTokenMessenger(
  tokenMessengerMinterProgram: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEEDS.tokenMessenger],
    tokenMessengerMinterProgram,
  )[0];
}

/** `token_minter` PDA on the TokenMessengerMinter program. */
export function deriveTokenMinter(
  tokenMessengerMinterProgram: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEEDS.tokenMinter],
    tokenMessengerMinterProgram,
  )[0];
}

/** `sender_authority` PDA on the TokenMessengerMinter program. */
export function deriveSenderAuthority(
  tokenMessengerMinterProgram: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEEDS.senderAuthority],
    tokenMessengerMinterProgram,
  )[0];
}

/**
 * `remote_token_messenger` PDA — keyed by the **destination domain**
 * as its decimal string representation (Circle's convention).
 */
export function deriveRemoteTokenMessenger(
  tokenMessengerMinterProgram: PublicKey,
  domain: number,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEEDS.remoteTokenMessenger, enc.encode(domain.toString())],
    tokenMessengerMinterProgram,
  )[0];
}

/** `local_token` PDA — keyed by the local USDC SPL mint. */
export function deriveLocalToken(
  tokenMessengerMinterProgram: PublicKey,
  mint: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEEDS.localToken, mint.toBytes()],
    tokenMessengerMinterProgram,
  )[0];
}

/**
 * `token_pair` PDA — used on the receive (mint) side to map a
 * (source domain, source token) pair to the local mint. Source token
 * is 32 bytes (left-padded for EVM sources).
 */
export function deriveTokenPair(
  tokenMessengerMinterProgram: PublicKey,
  sourceDomain: number,
  sourceTokenBytes32: Uint8Array,
): PublicKey {
  if (sourceTokenBytes32.length !== 32) {
    throw new Error(
      `deriveTokenPair: sourceTokenBytes32 must be 32 bytes, got ${sourceTokenBytes32.length}`,
    );
  }
  return PublicKey.findProgramAddressSync(
    [SEEDS.tokenPair, enc.encode(sourceDomain.toString()), sourceTokenBytes32],
    tokenMessengerMinterProgram,
  )[0];
}

/** `custody` token account PDA — keyed by the local USDC mint. */
export function deriveCustodyTokenAccount(
  tokenMessengerMinterProgram: PublicKey,
  mint: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEEDS.custody, mint.toBytes()],
    tokenMessengerMinterProgram,
  )[0];
}

/**
 * `denylist_account` PDA — owner-keyed. Burn fails if this PDA exists
 * with data; the user's denylist record is "absence of data."
 */
export function deriveDenylistAccount(
  tokenMessengerMinterProgram: PublicKey,
  owner: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEEDS.denylistAccount, owner.toBytes()],
    tokenMessengerMinterProgram,
  )[0];
}

/** `message_transmitter` config PDA on the MessageTransmitter program. */
export function deriveMessageTransmitter(
  messageTransmitterProgram: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEEDS.messageTransmitter],
    messageTransmitterProgram,
  )[0];
}

/**
 * `message_transmitter_authority` PDA — keyed by the *receiver*
 * program. For CCTP burns, the receiver is the TokenMessengerMinter.
 */
export function deriveMessageTransmitterAuthority(
  messageTransmitterProgram: PublicKey,
  receiverProgram: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEEDS.messageTransmitterAuthority, receiverProgram.toBytes()],
    messageTransmitterProgram,
  )[0];
}

/**
 * `used_nonce` PDA — message nonce is 32 bytes from a known offset in
 * the raw CCTP message body. The slice is `message[12..44]` per
 * Circle's `Message::NONCE_INDEX` / `Message::SENDER_INDEX` layout.
 */
export function deriveUsedNonce(
  messageTransmitterProgram: PublicKey,
  messageBytes: Uint8Array,
): PublicKey {
  if (messageBytes.length < 44) {
    throw new Error(
      `deriveUsedNonce: message must be at least 44 bytes, got ${messageBytes.length}`,
    );
  }
  const nonce = messageBytes.slice(12, 44);
  return PublicKey.findProgramAddressSync(
    [SEEDS.usedNonce, nonce],
    messageTransmitterProgram,
  )[0];
}

/** `__event_authority` PDA — emitted by Anchor's `#[event_cpi]`. */
export function deriveEventAuthority(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEEDS.eventAuthority], programId)[0];
}

export { SEEDS as SOLANA_CCTP_PDA_SEEDS };
