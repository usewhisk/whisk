import {
  explorerAddressUrl as chainExplorerAddressUrl,
  explorerTxUrl as chainExplorerTxUrl,
  getChain,
} from "@usewhisk/cctp";
import type { Chain } from "../types/chain.js";

export {
  CHAINS,
  chainByDomain,
  chainByEvmChainId,
  chainsByNetwork,
  getChain,
  isChainId,
  tryChainByEvmChainId,
} from "@usewhisk/cctp";
export { addressFormat, type AddressFormat } from "./address.js";

export function explorerTxUrl(chain: Chain, txHash: string): string {
  return chainExplorerTxUrl(getChain(chain), txHash);
}

export function explorerAddressUrl(chain: Chain, address: string): string {
  return chainExplorerAddressUrl(getChain(chain), address);
}
