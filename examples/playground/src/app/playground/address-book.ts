/**
 * Quick-pick recipients for the controls panel. Saves the tester from
 * typing the same address into every chain during the testnet sweep.
 *
 * Swap any entry for a wallet you control if you want the destination
 * funds to be recoverable. Non-EVM entries here are shown as hints and
 * only make sense when the destination chain matches the ecosystem.
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
