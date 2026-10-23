import { MuxedAccount, StrKey } from "@stellar/stellar-sdk";
import type { StellarChain } from "@usewhisk/cctp";
import {
  ConfigError,
  RouteUnavailableError,
  WrongChainError,
  toWhiskError,
  type WhiskError,
} from "../../errors/errors.js";
import type { StellarAdapter } from "../types.js";

/**
 * Run before the burn. `mint_and_forward` pays the recipient through the
 * USDC contract, which fails for a classic account without an authorized
 * trustline with room for the amount. `burnAmount` is in 6-decimal subunits.
 */
export async function stellarRecipientProblem(
  destination: StellarChain,
  wallet: StellarAdapter,
  recipient: string,
  burnAmount: bigint,
): Promise<WhiskError | null> {
  let network: string;
  try {
    network = await wallet.getNetwork();
  } catch (cause) {
    return toWhiskError(cause, "Failed to read the Stellar wallet's network.");
  }
  if (network !== destination.stellarNetwork) {
    return new WrongChainError(
      destination.stellarNetwork,
      new Error(`wallet is on ${network}`),
    );
  }

  // Contract balances live in the USDC contract itself, with no trustline.
  if (StrKey.isValidContract(recipient)) return null;

  // A muxed address is a G account plus an id; the trustline is the G's.
  const account = StrKey.isValidMed25519PublicKey(recipient)
    ? MuxedAccount.fromAddress(recipient, "0").baseAccount().accountId()
    : recipient;

  if (!wallet.getTrustline) {
    return new ConfigError(
      "The Stellar adapter has no getTrustline, so the recipient's USDC trustline cannot be checked before the burn. Nothing was sent.",
    );
  }

  let trustline: Awaited<
    ReturnType<NonNullable<StellarAdapter["getTrustline"]>>
  >;
  try {
    trustline = await wallet.getTrustline(account, {
      code: "USDC",
      issuer: destination.usdcIssuer,
    });
  } catch (cause) {
    return toWhiskError(
      cause,
      "Failed to read the recipient's USDC trustline on Stellar.",
    );
  }

  const refuse = (why: string) =>
    new RouteUnavailableError(
      "recipient_account_missing",
      `The recipient ${account} ${why} on ${destination.label}, so USDC cannot be minted to it. Nothing was sent.`,
      "stellar",
    );
  if (!trustline) return refuse("has no USDC trustline");
  if (!trustline.authorized) {
    return refuse("has a USDC trustline the issuer has not authorized");
  }
  // Stellar USDC has 7 decimals to the burn's 6.
  if (trustline.limit - trustline.balance < burnAmount * 10n) {
    return refuse("has no room left under its USDC trustline limit");
  }
  return null;
}
