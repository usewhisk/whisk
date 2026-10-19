import type { Resolver } from "../types/resolver.js";
import { addressFormat, looksLikeAddress } from "../chains/address.js";

/** Direct raw-address resolver — always first in the default chain. */
export const addressResolver: Resolver = {
  name: "address",
  matches: (input) => looksLikeAddress(input.trim()),
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
