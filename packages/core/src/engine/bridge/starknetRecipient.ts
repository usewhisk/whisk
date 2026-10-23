import { getStarknetClassHashAt, type StarknetChain } from "@usewhisk/cctp";
import {
  InvalidAddressError,
  RouteUnavailableError,
  WrongChainError,
  toWhiskError,
  type WhiskError,
} from "../../errors/errors.js";
import type { StarknetAdapter } from "../types.js";

const ETH_ADDRESS_END = 1n << 160n;
// Starknet reduces contract addresses below 2**251 - 256.
const STARKNET_ADDRESS_END = (1n << 251n) - 256n;

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

/**
 * For a well-formed felt. Account addresses are hashes, so one that fits in
 * 20 bytes is almost certainly an Ethereum address pasted by mistake.
 */
export function starknetAddressProblem(
  address: string,
): InvalidAddressError | null {
  const value = BigInt(address);
  if (value < ETH_ADDRESS_END) {
    return new InvalidAddressError(
      address,
      undefined,
      `${address} looks like an Ethereum address. Starknet addresses are 64 hex characters.`,
    );
  }
  if (value >= STARKNET_ADDRESS_END) {
    return new InvalidAddressError(
      address,
      undefined,
      `${address} is outside the range of Starknet addresses.`,
    );
  }
  return null;
}

/**
 * USDC sent to an address with no account sits there until someone deploys
 * one. The connected wallet's own address is taken as is, since a wallet
 * deploys its account with its first transaction.
 */
export async function starknetDeployProblem(
  chain: StarknetChain,
  address: string,
  options: {
    connected: readonly string[];
    allowUndeployed: boolean;
    rpcUrls?: readonly string[];
    fetch?: typeof fetch;
  },
): Promise<WhiskError | null> {
  const value = BigInt(address);
  if (options.allowUndeployed) return null;
  if (options.connected.some((a) => BigInt(a) === value)) return null;

  let classHash: string | null;
  try {
    classHash = await getStarknetClassHashAt(chain, address, {
      ...(options.rpcUrls && { rpcUrls: options.rpcUrls }),
      ...(options.fetch && { fetch: options.fetch }),
    });
  } catch (cause) {
    return toWhiskError(
      cause,
      "Failed to read the Starknet recipient account.",
    );
  }
  if (classHash !== null) return null;
  return new RouteUnavailableError(
    "recipient_not_deployed",
    `No Starknet account is deployed at ${address}. If this is a new wallet that has not sent a transaction yet, confirm the address to continue.`,
    "starknet",
  );
}
