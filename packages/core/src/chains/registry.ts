import type { Chain, ChainKind, ChainNetwork } from "../types/chain.js";

export type ChainInfo = {
  chain: Chain;
  label: string;
  kind: ChainKind;
  network: ChainNetwork;
  nativeSymbol: string;
  explorerTxBase: string;
  explorerAddressBase: string;
  /** Required for Solana (`?cluster=...`) and Sei (`?chain=atlantic-2`). */
  explorerQuery?: string;
  addressRegex: RegExp;
  addressHint: string;
  evmChainId?: number;
  usdcAddress?: string;
  eurcAddress?: string;
  usdtAddress?: string;
};

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** Stellar strkey — `G…`, `M…`, or `C…`. Base32 with checksum. */
const STELLAR_RE = /^[GMC][A-Z2-7]{55,68}$/;
/** Starknet felt252 — `0x` + 1..64 hex chars. */
const STARKNET_RE = /^0x[a-fA-F0-9]{1,64}$/;

const EVM_HINT = "0x… (40 hex chars)";
const SOL_HINT = "Base58 (32–44 chars)";
const STELLAR_HINT = "G…, M…, or C… (Stellar strkey)";
const STARKNET_HINT = "0x… (Starknet felt252)";

const CHAINS: ReadonlyArray<ChainInfo> = [
  /* ─── Mainnets ─────────────────────────────────────────────────────── */
  {
    chain: "Arbitrum",
    label: "Arbitrum",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://arbiscan.io/tx/",
    explorerAddressBase: "https://arbiscan.io/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 42_161,
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  {
    chain: "Avalanche",
    label: "Avalanche",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "AVAX",
    explorerTxBase: "https://snowtrace.io/tx/",
    explorerAddressBase: "https://snowtrace.io/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 43_114,
    usdcAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  },
  {
    chain: "Base",
    label: "Base",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://basescan.org/tx/",
    explorerAddressBase: "https://basescan.org/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 8_453,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  {
    chain: "Codex",
    label: "Codex",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://explorer.codex.xyz/tx/",
    explorerAddressBase: "https://explorer.codex.xyz/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 81_224,
    usdcAddress: "0xb73603C5d87fA094B7314C74ACE2e64D165016fb",
  },
  {
    chain: "Ethereum",
    label: "Ethereum",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://etherscan.io/tx/",
    explorerAddressBase: "https://etherscan.io/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 1,
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  {
    chain: "HyperEVM",
    label: "HyperEVM",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "HYPE",
    explorerTxBase: "https://app.hyperliquid.xyz/explorer/tx/",
    explorerAddressBase: "https://app.hyperliquid.xyz/explorer/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 999,
    usdcAddress: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
  },
  {
    chain: "Ink",
    label: "Ink",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://explorer.inkonchain.com/tx/",
    explorerAddressBase: "https://explorer.inkonchain.com/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 57_073,
    usdcAddress: "0xF1815bd50389c46847f0Bda824eC8da914045D14",
  },
  {
    chain: "Linea",
    label: "Linea",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://lineascan.build/tx/",
    explorerAddressBase: "https://lineascan.build/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 59_144,
    usdcAddress: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
  },
  {
    chain: "Monad",
    label: "Monad",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "MON",
    explorerTxBase: "https://monadexplorer.com/tx/",
    explorerAddressBase: "https://monadexplorer.com/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 143,
  },
  {
    chain: "Optimism",
    label: "OP Mainnet",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://optimistic.etherscan.io/tx/",
    explorerAddressBase: "https://optimistic.etherscan.io/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 10,
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  },
  {
    chain: "Plume",
    label: "Plume",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "PLUME",
    explorerTxBase: "https://explorer.plume.org/tx/",
    explorerAddressBase: "https://explorer.plume.org/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 98_866,
    usdcAddress: "0x78adD880A697070c1e765Ac44D65323a0DcCE913",
  },
  {
    chain: "Polygon",
    label: "Polygon",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "POL",
    explorerTxBase: "https://polygonscan.com/tx/",
    explorerAddressBase: "https://polygonscan.com/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 137,
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
  {
    chain: "Sei",
    label: "Sei",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "SEI",
    explorerTxBase: "https://seitrace.com/tx/",
    explorerAddressBase: "https://seitrace.com/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 1_329,
    usdcAddress: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392",
  },
  {
    chain: "Solana",
    label: "Solana",
    kind: "solana",
    network: "mainnet",
    nativeSymbol: "SOL",
    explorerTxBase: "https://explorer.solana.com/tx/",
    explorerAddressBase: "https://explorer.solana.com/address/",
    addressRegex: SOL_RE,
    addressHint: SOL_HINT,
    usdcAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  {
    chain: "Starknet",
    label: "Starknet",
    kind: "starknet",
    network: "mainnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://voyager.online/tx/",
    explorerAddressBase: "https://voyager.online/contract/",
    addressRegex: STARKNET_RE,
    addressHint: STARKNET_HINT,
    usdcAddress:
      "0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb",
  },
  {
    chain: "Stellar",
    label: "Stellar",
    kind: "stellar",
    network: "mainnet",
    nativeSymbol: "XLM",
    explorerTxBase: "https://stellar.expert/explorer/public/tx/",
    explorerAddressBase: "https://stellar.expert/explorer/public/account/",
    addressRegex: STELLAR_RE,
    addressHint: STELLAR_HINT,
    usdcAddress: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
  },
  {
    chain: "Sonic",
    label: "Sonic",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "S",
    explorerTxBase: "https://sonicscan.org/tx/",
    explorerAddressBase: "https://sonicscan.org/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 146,
    usdcAddress: "0x29219dd400f2Bf60E5a23d13Be72B486D4038894",
  },
  {
    chain: "Unichain",
    label: "Unichain",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://uniscan.xyz/tx/",
    explorerAddressBase: "https://uniscan.xyz/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 130,
    usdcAddress: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
  },
  {
    chain: "World_Chain",
    label: "World Chain",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://worldscan.org/tx/",
    explorerAddressBase: "https://worldscan.org/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 480,
    usdcAddress: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",
  },
  {
    chain: "XDC",
    label: "XDC",
    kind: "evm",
    network: "mainnet",
    nativeSymbol: "XDC",
    explorerTxBase: "https://explorer.xdc.network/tx/",
    explorerAddressBase: "https://explorer.xdc.network/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 50,
  },

  /* ─── Testnets ─────────────────────────────────────────────────────── */
  {
    chain: "Arbitrum_Sepolia",
    label: "Arbitrum Sepolia",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://sepolia.arbiscan.io/tx/",
    explorerAddressBase: "https://sepolia.arbiscan.io/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 421_614,
    usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  },
  {
    chain: "Arc_Testnet",
    label: "Arc Testnet",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "ARC",
    explorerTxBase: "https://testnet.arcscan.app/tx/",
    explorerAddressBase: "https://testnet.arcscan.app/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 5_042_002,
    usdcAddress: "0x3600000000000000000000000000000000000000",
    eurcAddress: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  },
  {
    chain: "Avalanche_Fuji",
    label: "Avalanche Fuji",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "AVAX",
    explorerTxBase: "https://testnet.snowtrace.io/tx/",
    explorerAddressBase: "https://testnet.snowtrace.io/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 43_113,
    usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
    eurcAddress: "0x5e44db7996c682e92a960b65ac713a54ad815c6b",
  },
  {
    chain: "Base_Sepolia",
    label: "Base Sepolia",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://sepolia.basescan.org/tx/",
    explorerAddressBase: "https://sepolia.basescan.org/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 84_532,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    eurcAddress: "0x808456652fdb597867f38412077A9182bf77359F",
  },
  {
    chain: "Codex_Testnet",
    label: "Codex Testnet",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://explorer.codex-stg.xyz/tx/",
    explorerAddressBase: "https://explorer.codex-stg.xyz/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 812_242,
    usdcAddress: "0x6d7f141b6819C2c9CC2f818e6ad549E7Ca090F8f",
  },
  {
    chain: "Edge_Testnet",
    label: "Edge Testnet",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://edge-testnet.explorer.alchemy.com/tx/",
    explorerAddressBase: "https://edge-testnet.explorer.alchemy.com/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 33_431,
    usdcAddress: "0x2d9F7CAD728051AA35Ecdc472a14cf8cDF5CFD6B",
  },
  {
    chain: "Ethereum_Sepolia",
    label: "Ethereum Sepolia",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://sepolia.etherscan.io/tx/",
    explorerAddressBase: "https://sepolia.etherscan.io/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 11_155_111,
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    eurcAddress: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4",
  },
  {
    chain: "HyperEVM_Testnet",
    label: "HyperEVM Testnet",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "HYPE",
    // Hyperliquid's testnet UI doesn't resolve HyperEVM tx hashes; use the community explorer.
    explorerTxBase: "https://hyperevm-explorer.vercel.app/tx/",
    explorerAddressBase: "https://hyperevm-explorer.vercel.app/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 998,
    usdcAddress: "0x2B3370eE501B4a559b57D449569354196457D8Ab",
  },
  {
    chain: "Ink_Testnet",
    label: "Ink Sepolia",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://explorer-sepolia.inkonchain.com/tx/",
    explorerAddressBase: "https://explorer-sepolia.inkonchain.com/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 763_373,
    usdcAddress: "0xFabab97dCE620294D2B0b0e46C68964e326300Ac",
  },
  {
    chain: "Linea_Sepolia",
    label: "Linea Sepolia",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://sepolia.lineascan.build/tx/",
    explorerAddressBase: "https://sepolia.lineascan.build/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 59_141,
    usdcAddress: "0xfece4462d57bd51a6a552365a011b95f0e16d9b7",
  },
  {
    chain: "Monad_Testnet",
    label: "Monad Testnet",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "MON",
    explorerTxBase: "https://testnet.monadexplorer.com/tx/",
    explorerAddressBase: "https://testnet.monadexplorer.com/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 10_143,
    usdcAddress: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  },
  {
    chain: "Morph_Testnet",
    label: "Morph Hoodi",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://explorer-hoodi.morph.network/tx/",
    explorerAddressBase: "https://explorer-hoodi.morph.network/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 2_910,
    usdcAddress: "0x7433b41C6c5e1d58D4Da99483609520255ab661B",
  },
  {
    chain: "Optimism_Sepolia",
    label: "Optimism Sepolia",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://sepolia-optimism.etherscan.io/tx/",
    explorerAddressBase: "https://sepolia-optimism.etherscan.io/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 11_155_420,
    usdcAddress: "0x5fD84259d66Cd46123540766Be93DFE6D43130D7",
  },
  {
    chain: "Plume_Testnet",
    label: "Plume Testnet",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "PLUME",
    explorerTxBase: "https://testnet-explorer.plume.org/tx/",
    explorerAddressBase: "https://testnet-explorer.plume.org/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 98_867,
    usdcAddress: "0xcB5f30e335672893c7eb944B374c196392C19D18",
  },
  {
    chain: "Polygon_Amoy_Testnet",
    label: "Polygon Amoy",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "POL",
    explorerTxBase: "https://amoy.polygonscan.com/tx/",
    explorerAddressBase: "https://amoy.polygonscan.com/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 80_002,
    usdcAddress: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  },
  {
    chain: "Sei_Testnet",
    label: "Sei Testnet",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "SEI",
    explorerTxBase: "https://seitrace.com/tx/",
    explorerAddressBase: "https://seitrace.com/address/",
    explorerQuery: "?chain=atlantic-2",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 1_328,
    usdcAddress: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED",
  },
  {
    chain: "Solana_Devnet",
    label: "Solana Devnet",
    kind: "solana",
    network: "testnet",
    nativeSymbol: "SOL",
    explorerTxBase: "https://explorer.solana.com/tx/",
    explorerAddressBase: "https://explorer.solana.com/address/",
    explorerQuery: "?cluster=devnet",
    addressRegex: SOL_RE,
    addressHint: SOL_HINT,
    usdcAddress: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  },
  {
    chain: "Starknet_Sepolia",
    label: "Starknet Sepolia",
    kind: "starknet",
    network: "testnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://sepolia.voyager.online/tx/",
    explorerAddressBase: "https://sepolia.voyager.online/contract/",
    addressRegex: STARKNET_RE,
    addressHint: STARKNET_HINT,
    usdcAddress:
      "0x0512feAc6339Ff7889822cb5aA2a86C848e9D392bB0E3E237C008674feeD8343",
  },
  {
    chain: "Stellar_Testnet",
    label: "Stellar Testnet",
    kind: "stellar",
    network: "testnet",
    nativeSymbol: "XLM",
    explorerTxBase: "https://stellar.expert/explorer/testnet/tx/",
    explorerAddressBase: "https://stellar.expert/explorer/testnet/account/",
    addressRegex: STELLAR_RE,
    addressHint: STELLAR_HINT,
    usdcAddress: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  },
  {
    chain: "Sonic_Testnet",
    label: "Sonic Testnet",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "S",
    explorerTxBase: "https://testnet.sonicscan.org/tx/",
    explorerAddressBase: "https://testnet.sonicscan.org/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 14_601,
    usdcAddress: "0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51",
  },
  {
    chain: "Unichain_Sepolia",
    label: "Unichain Sepolia",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://unichain-sepolia.blockscout.com/tx/",
    explorerAddressBase: "https://unichain-sepolia.blockscout.com/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 1_301,
    usdcAddress: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
  },
  {
    chain: "World_Chain_Sepolia",
    label: "World Chain Sepolia",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "ETH",
    explorerTxBase: "https://sepolia.worldscan.org/tx/",
    explorerAddressBase: "https://sepolia.worldscan.org/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 4_801,
    usdcAddress: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88",
  },
  {
    chain: "XDC_Apothem",
    label: "XDC Apothem",
    kind: "evm",
    network: "testnet",
    nativeSymbol: "TXDC",
    explorerTxBase: "https://explorer.apothem.network/tx/",
    explorerAddressBase: "https://explorer.apothem.network/address/",
    addressRegex: EVM_RE,
    addressHint: EVM_HINT,
    evmChainId: 51,
  },
];

const BY_CHAIN: ReadonlyMap<Chain, ChainInfo> = new Map(
  CHAINS.map((c) => [c.chain, c]),
);

const BY_EVM_CHAIN_ID: ReadonlyMap<number, ChainInfo> = new Map(
  CHAINS.filter((c) => c.evmChainId !== undefined).map(
    (c) => [c.evmChainId as number, c] as const,
  ),
);

/** Throws if the chain is not registered. */
export function chainInfo(chain: Chain): ChainInfo {
  const info = BY_CHAIN.get(chain);
  if (!info) {
    throw new Error(`Whisk: chain "${chain}" is not in the registry.`);
  }
  return info;
}

export function chainByEvmId(
  chainId: number | undefined,
): ChainInfo | undefined {
  if (chainId == null) return undefined;
  return BY_EVM_CHAIN_ID.get(chainId);
}

export function allChains(): ReadonlyArray<ChainInfo> {
  return CHAINS;
}

export function chainsByNetwork(
  network: ChainNetwork,
): ReadonlyArray<ChainInfo> {
  return CHAINS.filter((c) => c.network === network);
}

export function chainsByKind(kind: ChainKind): ReadonlyArray<ChainInfo> {
  return CHAINS.filter((c) => c.kind === kind);
}

export type SupportedTokenAlias = "USDC" | "EURC" | "USDT";

export function supportedTokensFor(chain: Chain): SupportedTokenAlias[] {
  const info = chainInfo(chain);
  const out: SupportedTokenAlias[] = [];
  if (info.usdcAddress) out.push("USDC");
  if (info.eurcAddress) out.push("EURC");
  if (info.usdtAddress) out.push("USDT");
  return out;
}

export function tokenAddressFor(
  chain: Chain,
  token: SupportedTokenAlias,
): string | undefined {
  const info = chainInfo(chain);
  switch (token) {
    case "USDC":
      return info.usdcAddress;
    case "EURC":
      return info.eurcAddress;
    case "USDT":
      return info.usdtAddress;
  }
}

export function explorerTxUrl(chain: Chain, txHash: string): string {
  const info = chainInfo(chain);
  return `${info.explorerTxBase}${txHash}${info.explorerQuery ?? ""}`;
}

export function explorerAddressUrl(chain: Chain, address: string): string {
  const info = chainInfo(chain);
  return `${info.explorerAddressBase}${address}${info.explorerQuery ?? ""}`;
}
