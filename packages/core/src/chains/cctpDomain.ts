import type { Chain } from "../types/chain.js";

// Mirrored from @circle-fin/app-kit/chains. Testnets share their
// mainnet's domain — Iris distinguishes via the API host, not the
// domain number. Unmapped chains skip Iris polling and fall back to
// App Kit's built-in flow.
const DOMAIN_MAP: Partial<Record<Chain, number>> = {
  Ethereum: 0,
  Ethereum_Sepolia: 0,
  Avalanche: 1,
  Avalanche_Fuji: 1,
  Optimism: 2,
  Optimism_Sepolia: 2,
  Arbitrum: 3,
  Arbitrum_Sepolia: 3,
  Solana: 5,
  Solana_Devnet: 5,
  Base: 6,
  Base_Sepolia: 6,
  Polygon: 7,
  Polygon_Amoy_Testnet: 7,
  Unichain: 10,
  Unichain_Sepolia: 10,
  Linea: 11,
  Linea_Sepolia: 11,
  Codex: 12,
  Codex_Testnet: 12,
  Sonic: 13,
  Sonic_Testnet: 13,
  World_Chain: 14,
  World_Chain_Sepolia: 14,
  Monad: 15,
  Monad_Testnet: 15,
  Sei: 16,
  Sei_Testnet: 16,
  XDC: 18,
  XDC_Apothem: 18,
  HyperEVM: 19,
  HyperEVM_Testnet: 19,
  Ink: 21,
  Ink_Testnet: 21,
  Plume: 22,
  Plume_Testnet: 22,
  Arc_Testnet: 26,
  Edge_Testnet: 28,
  Morph_Testnet: 30,
};

export function cctpDomainFor(chain: Chain): number | undefined {
  return DOMAIN_MAP[chain];
}

export function chainForCctpDomain(domain: number): Chain | undefined {
  for (const [chain, id] of Object.entries(DOMAIN_MAP) as Array<
    [Chain, number]
  >) {
    if (id === domain) return chain;
  }
  return undefined;
}
