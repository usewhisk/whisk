import type {
  CctpChain,
  CctpDomain,
  EvmChain,
  EvmChainId,
  Network,
  SolanaChain,
  StarknetChain,
  StellarChain,
} from "./types.js";
import { EVM_MAINNET_CHAINS } from "./mainnet.js";
import { EVM_TESTNET_CHAINS } from "./testnet.js";
import { Solana, SolanaDevnet } from "./solana.js";
import { Stellar, StellarTestnet } from "./stellar.js";
import { Starknet, StarknetSepolia } from "./starknet.js";
import { InvalidInputError } from "../errors.js";

export class UnknownChainError extends InvalidInputError {
  constructor(detail: string) {
    super("invalid_chain", `Unknown chain: ${detail}`);
    this.name = "UnknownChainError";
  }
}

export const CHAINS = [
  ...EVM_MAINNET_CHAINS,
  ...EVM_TESTNET_CHAINS,
  Solana,
  SolanaDevnet,
  Stellar,
  StellarTestnet,
  Starknet,
  StarknetSepolia,
] as const satisfies readonly CctpChain[];

export type ChainId = (typeof CHAINS)[number]["id"];

const ALL: readonly CctpChain[] = CHAINS;

const BY_ID = new Map(ALL.map((c) => [c.id, c]));

const BY_EVM_CHAIN_ID = new Map(
  ALL.filter(isEvmChain).map((c) => [c.evmChainId, c]),
);

const BY_DOMAIN_AND_NETWORK = new Map(
  ALL.map((c) => [`${c.cctpDomain}:${c.network}`, c]),
);

export function isEvmChain(chain: CctpChain): chain is EvmChain {
  return chain.ecosystem === "evm";
}

export function isSolanaChain(chain: CctpChain): chain is SolanaChain {
  return chain.ecosystem === "solana";
}

export function isStellarChain(chain: CctpChain): chain is StellarChain {
  return chain.ecosystem === "stellar";
}

export function isStarknetChain(chain: CctpChain): chain is StarknetChain {
  return chain.ecosystem === "starknet";
}

export function isChainId(value: string): value is ChainId {
  return BY_ID.has(value);
}

export function getChain(id: ChainId): CctpChain {
  const chain = BY_ID.get(id);
  if (!chain) throw new UnknownChainError(`id="${id}"`);
  return chain;
}

export function chainsByNetwork(network: Network): readonly CctpChain[] {
  return ALL.filter((c) => c.network === network);
}

export function chainByEvmChainId(evmChainId: EvmChainId): EvmChain {
  const chain = BY_EVM_CHAIN_ID.get(evmChainId);
  if (!chain) throw new UnknownChainError(`evmChainId=${evmChainId}`);
  return chain;
}

/** For wallet chain ids, which can be any chain the wallet knows. */
export function tryChainByEvmChainId(
  evmChainId: EvmChainId,
): EvmChain | undefined {
  return BY_EVM_CHAIN_ID.get(evmChainId);
}

export function chainByDomain(domain: CctpDomain, network: Network): CctpChain {
  const chain = BY_DOMAIN_AND_NETWORK.get(`${domain}:${network}`);
  if (!chain) {
    throw new UnknownChainError(`domain=${domain} network=${network}`);
  }
  return chain;
}

export function explorerTxUrl(chain: CctpChain, txHash: string): string {
  return `${chain.explorerUrl}/tx/${txHash}${chain.explorerQuery ?? ""}`;
}

export function explorerAddressUrl(chain: CctpChain, address: string): string {
  return `${chain.explorerUrl}/${addressPath(chain, address)}/${address}${chain.explorerQuery ?? ""}`;
}

function addressPath(chain: CctpChain, address: string): string {
  switch (chain.ecosystem) {
    case "starknet":
      return "contract";
    case "stellar":
      return address.startsWith("C") ? "contract" : "account";
    default:
      return "address";
  }
}
