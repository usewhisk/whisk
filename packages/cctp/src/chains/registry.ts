/**
 * Chain registry — single source of truth for every supported chain.
 *
 * Lookup functions throw `UnknownChainError` rather than returning
 * `undefined`. Callers can assume the value is valid once a lookup
 * succeeds. This trades flexibility for fewer null checks downstream.
 */
import type {
  CctpChain,
  CctpDomain,
  CctpNetwork,
  ChainName,
  EvmChainId,
  EvmCctpChain,
  SolanaCctpChain,
  SolanaCluster,
  StarknetCctpChain,
  StarknetNetwork,
  StellarCctpChain,
  StellarNetwork,
} from "./types.js";
import { MAINNET_CHAINS } from "./mainnet.js";
import { TESTNET_CHAINS } from "./testnet.js";
import { Stellar, StellarTestnet } from "./stellar.js";
import { Starknet, StarknetSepolia } from "./starknet.js";
import { InvalidInputError } from "../errors.js";

export class UnknownChainError extends InvalidInputError {
  constructor(detail: string) {
    super("invalid_chain", `Unknown chain: ${detail}`);
    this.name = "UnknownChainError";
  }
}

const ALL_CHAINS: readonly CctpChain[] = [
  ...MAINNET_CHAINS,
  ...TESTNET_CHAINS,
  Stellar,
  StellarTestnet,
  Starknet,
  StarknetSepolia,
];

const BY_NAME = new Map<ChainName, CctpChain>(
  ALL_CHAINS.map((c) => [c.name, c]),
);

const BY_EVM_CHAIN_ID = new Map<EvmChainId, EvmCctpChain>(
  ALL_CHAINS.filter(isEvmChain).map((c) => [c.evmChainId, c]),
);

const BY_SOLANA_CLUSTER = new Map<SolanaCluster, SolanaCctpChain>(
  ALL_CHAINS.filter(isSolanaChain).map((c) => [c.cluster, c]),
);

const BY_STELLAR_NETWORK = new Map<StellarNetwork, StellarCctpChain>(
  ALL_CHAINS.filter(isStellarChain).map((c) => [c.stellarNetwork, c]),
);

const BY_STARKNET_NETWORK = new Map<StarknetNetwork, StarknetCctpChain>(
  ALL_CHAINS.filter(isStarknetChain).map((c) => [c.starknetNetwork, c]),
);

function isEvmChain(chain: CctpChain): chain is EvmCctpChain {
  return chain.ecosystem === "evm";
}

function isSolanaChain(chain: CctpChain): chain is SolanaCctpChain {
  return chain.ecosystem === "solana";
}

function isStellarChain(chain: CctpChain): chain is StellarCctpChain {
  return chain.ecosystem === "stellar";
}

function isStarknetChain(chain: CctpChain): chain is StarknetCctpChain {
  return chain.ecosystem === "starknet";
}

/**
 * One chain can have multiple entries with the same domain (mainnet +
 * testnet). The lookup needs a network discriminator.
 */
const BY_DOMAIN_AND_NETWORK = new Map<string, CctpChain>(
  ALL_CHAINS.map((c) => [`${c.cctpDomain}:${c.network}`, c]),
);

export function allChains(): readonly CctpChain[] {
  return ALL_CHAINS;
}

export function chainsByNetwork(network: CctpNetwork): readonly CctpChain[] {
  return ALL_CHAINS.filter((c) => c.network === network);
}

export function getChain(name: ChainName): CctpChain {
  const chain = BY_NAME.get(name);
  if (!chain) throw new UnknownChainError(`name="${name}"`);
  return chain;
}

export function tryGetChain(name: ChainName): CctpChain | undefined {
  return BY_NAME.get(name);
}

export function chainByEvmChainId(evmChainId: EvmChainId): EvmCctpChain {
  const chain = BY_EVM_CHAIN_ID.get(evmChainId);
  if (!chain) throw new UnknownChainError(`evmChainId=${evmChainId}`);
  return chain;
}

export function tryChainByEvmChainId(
  evmChainId: EvmChainId,
): EvmCctpChain | undefined {
  return BY_EVM_CHAIN_ID.get(evmChainId);
}

export function chainBySolanaCluster(cluster: SolanaCluster): SolanaCctpChain {
  const chain = BY_SOLANA_CLUSTER.get(cluster);
  if (!chain) throw new UnknownChainError(`solanaCluster=${cluster}`);
  return chain;
}

export function tryChainBySolanaCluster(
  cluster: SolanaCluster,
): SolanaCctpChain | undefined {
  return BY_SOLANA_CLUSTER.get(cluster);
}

export function chainByStellarNetwork(
  stellarNetwork: StellarNetwork,
): StellarCctpChain {
  const chain = BY_STELLAR_NETWORK.get(stellarNetwork);
  if (!chain) throw new UnknownChainError(`stellarNetwork=${stellarNetwork}`);
  return chain;
}

export function tryChainByStellarNetwork(
  stellarNetwork: StellarNetwork,
): StellarCctpChain | undefined {
  return BY_STELLAR_NETWORK.get(stellarNetwork);
}

export function chainByStarknetNetwork(
  starknetNetwork: StarknetNetwork,
): StarknetCctpChain {
  const chain = BY_STARKNET_NETWORK.get(starknetNetwork);
  if (!chain) throw new UnknownChainError(`starknetNetwork=${starknetNetwork}`);
  return chain;
}

export function tryChainByStarknetNetwork(
  starknetNetwork: StarknetNetwork,
): StarknetCctpChain | undefined {
  return BY_STARKNET_NETWORK.get(starknetNetwork);
}

export { isEvmChain, isSolanaChain, isStellarChain, isStarknetChain };

export function chainByDomain(
  domain: CctpDomain,
  network: CctpNetwork,
): CctpChain {
  const chain = BY_DOMAIN_AND_NETWORK.get(`${domain}:${network}`);
  if (!chain) {
    throw new UnknownChainError(`domain=${domain} network=${network}`);
  }
  return chain;
}

export function tryChainByDomain(
  domain: CctpDomain,
  network: CctpNetwork,
): CctpChain | undefined {
  return BY_DOMAIN_AND_NETWORK.get(`${domain}:${network}`);
}

/**
 * Explorer URL for a transaction on a given chain.
 */
export function explorerTxUrl(chain: CctpChain, txHash: string): string {
  return `${chain.explorerUrl}/tx/${txHash}`;
}

/**
 * Explorer URL for an address on a given chain.
 */
export function explorerAddressUrl(chain: CctpChain, address: string): string {
  return `${chain.explorerUrl}/address/${address}`;
}
