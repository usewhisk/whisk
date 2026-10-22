import type { Resolver } from "../types/resolver.js";
import { addressFormat, looksLikeAddress } from "../chains/address.js";

/** Raw-address resolver, used when the config sets no resolver. */
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
