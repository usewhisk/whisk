import type { PublicKey } from "@solana/web3.js";
import type { SolanaChain } from "@usewhisk/cctp";
import {
  RouteUnavailableError,
  WrongChainError,
  toWhiskError,
  type WhiskError,
} from "../../errors/errors.js";
import type { SolanaAdapter } from "../types.js";

/**
 * Run before the burn. `receive_message` has no room to create the
 * recipient's USDC account, so a burn to a recipient without one cannot be
 * minted until someone creates it.
 */
export async function solanaRecipientProblem(
  destination: SolanaChain,
  wallet: SolanaAdapter,
  recipientUsdcAta: PublicKey,
): Promise<WhiskError | null> {
  let cluster: string;
  try {
    cluster = await wallet.getCluster();
  } catch (cause) {
    return toWhiskError(cause, "Failed to read the Solana wallet's cluster.");
  }
  if (cluster !== destination.cluster) {
    return new WrongChainError(
      destination.cluster,
      new Error(`wallet is on ${cluster}`),
    );
  }

  let account: { data: Uint8Array } | null;
  try {
    account = await wallet.getAccountInfo(recipientUsdcAta.toBase58());
  } catch (cause) {
    return toWhiskError(
      cause,
      "Failed to read the recipient's USDC account on Solana.",
    );
  }
  if (account) return null;
  return new RouteUnavailableError(
    "recipient_account_missing",
    `The recipient has no USDC account on ${destination.label} (${recipientUsdcAta.toBase58()}). It has to exist before USDC can be minted to it. Nothing was sent.`,
    "solana",
  );
}
