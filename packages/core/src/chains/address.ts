import { getChain, type Ecosystem } from "@usewhisk/cctp";
import type { Chain } from "../types/chain.js";

export type AddressFormat = {
  /** A shape check for form input. The engine validates fully at quote time. */
  pattern: RegExp;
  hint: string;
};

const FORMATS: Record<Ecosystem, AddressFormat> = {
  evm: { pattern: /^0x[a-fA-F0-9]{40}$/, hint: "0x… (40 hex chars)" },
  solana: {
    pattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    hint: "Base58 (32 to 44 chars)",
  },
  stellar: {
    pattern: /^[GMC][A-Z2-7]{55,68}$/,
    hint: "G…, M…, or C… (Stellar strkey)",
  },
  starknet: {
    pattern: /^0x[a-fA-F0-9]{1,64}$/,
    hint: "0x… (Starknet felt252)",
  },
};

export function addressFormat(chain: Chain): AddressFormat {
  return FORMATS[getChain(chain).ecosystem];
}

/** Whether `input` has the shape of an address on any ecosystem. */
export function looksLikeAddress(input: string): boolean {
  return Object.values(FORMATS).some((f) => f.pattern.test(input));
}
