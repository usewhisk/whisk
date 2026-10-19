import type { Network, TransferSpeed } from "@usewhisk/cctp";
import type { Chain } from "../types/chain.js";

/**
 * Where a transfer stands. `signing` is written before the wallet is asked,
 * `burned` as soon as the wallet returns the burn hash, `minted` once the
 * recipient has the USDC.
 */
export type InflightStep = "signing" | "burned" | "attested" | "minted";

/** JSON-safe, so a store can keep it anywhere. Amounts are subunit strings. */
export type InflightRecord = {
  version: 2;
  /** The quote id the transfer was sent from. */
  id: string;
  network: Network;
  sourceChain: Chain;
  destinationChain: Chain;
  mint: "forwarder" | "adapter";
  speed: TransferSpeed;
  amountBurned: string;
  recipient: string;
  step: InflightStep;
  sourceTxHash?: string;
  mintTxHash?: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * Where the engine keeps transfers between the burn and the mint. Records of
 * burned transfers never expire: they are removed only when the caller says.
 */
export interface InflightStore {
  put(record: InflightRecord): Promise<void>;
  list(): Promise<readonly InflightRecord[]>;
  remove(id: string): Promise<void>;
}
