/**
 * Solana CCTP V2 protocol layer.
 *
 * PDA derivation, Anchor discriminators, Borsh helpers, and the burn /
 * receive instruction builders.
 */
export {
  deriveCustodyTokenAccount,
  deriveDenylistAccount,
  deriveEventAuthority,
  deriveLocalToken,
  deriveMessageTransmitter,
  deriveMessageTransmitterAuthority,
  deriveRemoteTokenMessenger,
  deriveSenderAuthority,
  deriveTokenMessenger,
  deriveTokenMinter,
  deriveTokenPair,
  deriveUsedNonce,
  SOLANA_CCTP_PDA_SEEDS,
} from "./pda.js";

export {
  anchorDiscriminator,
  DISCRIMINATOR_DEPOSIT_FOR_BURN,
  DISCRIMINATOR_DEPOSIT_FOR_BURN_WITH_HOOK,
  DISCRIMINATOR_RECEIVE_MESSAGE,
} from "./discriminators.js";

export {
  buildSolanaBurnIntent,
  burnIntentToTransactionInstruction,
  SOLANA_ANY_DESTINATION_CALLER,
} from "./burn.js";
export type {
  BuildSolanaBurnIntentInput,
  SolanaBurnIntent,
  SolanaInstruction,
} from "./burn.js";

export {
  buildSolanaReceiveIntent,
  receiveIntentToTransactionInstruction,
} from "./receive.js";
export type {
  BuildSolanaReceiveIntentInput,
  SolanaReceiveIntent,
} from "./receive.js";

export { parseTokenMessengerFeeRecipient } from "./state.js";
