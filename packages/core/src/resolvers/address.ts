import type { Resolver } from "../types/resolver.js";
import { addressFormat } from "../chains/address.js";

/** Direct raw-address resolver — always first in the default chain. */
export const addressResolver: Resolver = {
  name: "address",
  matches: (input) => {
    const trimmed = input.trim();
    return (
      /^0x[a-fA-F0-9]{40}$/.test(trimmed) ||
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)
    );
  },
  resolve: async (input, { chain }) => {
    const trimmed = input.trim();
    if (!addressFormat(chain).pattern.test(trimmed)) {
      return null;
    }
    return {
      address: trimmed,
      chain,
    };
  },
};
