import { getChain } from "@usewhisk/cctp";
import { ConfigError } from "../errors/index.js";
import type { Chain } from "../types/index.js";

export type AppEnvironment = "test" | "live";

/**
 * A live app ID serves mainnet chains and a test app ID testnet ones. Called
 * before anything is signed, with the network taken from the source chain.
 */
export function assertSourceMatchesApp(
  sourceChain: Chain,
  environment: AppEnvironment,
): void {
  const network = getChain(sourceChain).network;
  const expected = environment === "live" ? "mainnet" : "testnet";
  if (network !== expected) {
    throw new ConfigError(
      `${sourceChain} is a ${network} chain, and this app ID is for ${expected} chains. Use the app's ${environment === "live" ? "test" : "live"} app ID for ${network}.`,
    );
  }
}
