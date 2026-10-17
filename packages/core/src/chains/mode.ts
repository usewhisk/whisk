import type { Chain } from "../types/chain.js";
import type { WhiskMode } from "../types/config.js";
import { getChain } from "@usewhisk/cctp";

/** Returns "mainnet" when every chain is mainnet, "testnet" otherwise. */
export function inferMode(chains: ReadonlyArray<Chain>): WhiskMode {
  if (chains.length === 0) return "testnet";
  let sawMainnet = false;
  let sawTestnet = false;
  for (const chain of chains) {
    if (getChain(chain).network === "mainnet") sawMainnet = true;
    else sawTestnet = true;
  }
  return sawMainnet && !sawTestnet ? "mainnet" : "testnet";
}

/** Resolve the active mode. Explicit value wins; otherwise infer from chains. */
export function resolveMode(
  explicit: WhiskMode | undefined,
  chains: ReadonlyArray<Chain>,
): WhiskMode {
  const inferred = inferMode(chains);
  if (!explicit) return inferred;

  if (explicit !== inferred && chains.length > 0) {
    const mixed =
      inferred === "testnet" &&
      chains.some((c) => getChain(c).network === "mainnet");
    // eslint-disable-next-line no-console
    console.warn(
      `[whisk] config.mode is "${explicit}" but the chain list looks like ${inferred} (${
        mixed ? "mixed" : "all " + inferred
      }). Mode wins, but double-check this is intentional.`,
    );
  }
  return explicit;
}
