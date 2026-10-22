/**
 * Solana CCTP on-chain state parsing.
 *
 * The TokenMessenger account holds the `fee_recipient` pubkey that
 * `receive_message` requires as a remaining-account constraint. The
 * account isn't derived: it's an arbitrary owner-configured pubkey
 * stored in state, so the executor must read it from chain.
 *
 * Account layout (Anchor, verified against Circle's
 * `programs/v2/token-messenger-minter/src/token_messenger/state.rs`):
 *
 *   0..8     discriminator
 *   8..40    denylister              Pubkey
 *   40..72   owner                   Pubkey
 *   72..104  pending_owner           Pubkey
 *   104..108 message_body_version    u32 LE
 *   108..109 authority_bump          u8
 *   109..141 fee_recipient           Pubkey
 *   141..173 min_fee_controller      Pubkey
 *   173..177 min_fee                 u32 LE
 */
import { PublicKey } from "@solana/web3.js";
import { InvalidInputError } from "../errors.js";

const FEE_RECIPIENT_OFFSET = 109;
const FEE_RECIPIENT_END = 141;

/** Throws if the account data ends before `fee_recipient` does. */
export function parseTokenMessengerFeeRecipient(
  accountData: Uint8Array,
): PublicKey {
  if (accountData.length < FEE_RECIPIENT_END) {
    throw new InvalidInputError(
      "invalid_input",
      `TokenMessenger account too small (${accountData.length} bytes) — cannot read fee_recipient.`,
    );
  }
  return new PublicKey(
    accountData.slice(FEE_RECIPIENT_OFFSET, FEE_RECIPIENT_END),
  );
}
