/**
 * Sample recipients. Funds sent to these are not recoverable; use a wallet
 * you control if you want them back.
 */
export type AddressEntry = {
  label: string;
  value: string;
  kind: "address" | "ens";
};

export const ADDRESS_BOOK: AddressEntry[] = [
  { label: "vitalik.eth", value: "vitalik.eth", kind: "ens" },
  {
    label: "EVM burn",
    value: "0x000000000000000000000000000000000000dEaD",
    kind: "address",
  },
];
