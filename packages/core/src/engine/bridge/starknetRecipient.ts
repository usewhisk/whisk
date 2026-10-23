import type { StarknetChain } from "@usewhisk/cctp";
import {
  WrongChainError,
  toWhiskError,
  type WhiskError,
} from "../../errors/errors.js";
import type { StarknetAdapter } from "../types.js";

/** Run before the burn, so a wallet on the wrong chain can't strand it. */
export async function starknetRecipientProblem(
  destination: StarknetChain,
  wallet: StarknetAdapter,
): Promise<WhiskError | null> {
  let chainId: string;
  try {
    chainId = await wallet.getChainId();
  } catch (cause) {
    return toWhiskError(cause, "Failed to read the Starknet wallet's chain.");
  }
  if (chainId !== destination.chainId) {
    return new WrongChainError(
      destination.chainId,
      new Error(`wallet is on ${chainId}`),
    );
  }
  return null;
}
