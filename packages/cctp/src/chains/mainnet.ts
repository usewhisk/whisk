/**
 * CCTP V2 EVM mainnet chains.
 */
import type { CctpChain, EvmCctpChain } from "./types.js";
import {
  TOKEN_MESSENGER_V2_EVM_MAINNET,
  MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
} from "./constants.js";

export const Ethereum: EvmCctpChain = {
  name: "Ethereum",
  label: "Ethereum",
  ecosystem: "evm",
  network: "mainnet",
  evmChainId: 1,
  cctpDomain: 0,
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  defaultRpcUrls: [
    "https://eth.llamarpc.com",
    "https://ethereum-rpc.publicnode.com",
  ],
  explorerUrl: "https://etherscan.io",
  supportsFastTransfer: true,
};

export const Avalanche: EvmCctpChain = {
  name: "Avalanche",
  label: "Avalanche",
  ecosystem: "evm",
  network: "mainnet",
  evmChainId: 43114,
  cctpDomain: 1,
  usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  defaultRpcUrls: [
    "https://api.avax.network/ext/bc/C/rpc",
    "https://avalanche-c-chain-rpc.publicnode.com",
  ],
  explorerUrl: "https://snowtrace.io",
  supportsFastTransfer: false,
};

export const Optimism: EvmCctpChain = {
  name: "Optimism",
  label: "OP Mainnet",
  ecosystem: "evm",
  network: "mainnet",
  evmChainId: 10,
  cctpDomain: 2,
  usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  defaultRpcUrls: [
    "https://mainnet.optimism.io",
    "https://optimism-rpc.publicnode.com",
  ],
  explorerUrl: "https://optimistic.etherscan.io",
  supportsFastTransfer: true,
};

export const Arbitrum: EvmCctpChain = {
  name: "Arbitrum",
  label: "Arbitrum One",
  ecosystem: "evm",
  network: "mainnet",
  evmChainId: 42161,
  cctpDomain: 3,
  usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  defaultRpcUrls: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum-one-rpc.publicnode.com",
  ],
  explorerUrl: "https://arbiscan.io",
  supportsFastTransfer: true,
};

export const Base: EvmCctpChain = {
  name: "Base",
  label: "Base",
  ecosystem: "evm",
  network: "mainnet",
  evmChainId: 8453,
  cctpDomain: 6,
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  defaultRpcUrls: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
  ],
  explorerUrl: "https://basescan.org",
  supportsFastTransfer: true,
};

export const Polygon: EvmCctpChain = {
  name: "Polygon",
  label: "Polygon PoS",
  ecosystem: "evm",
  network: "mainnet",
  evmChainId: 137,
  cctpDomain: 7,
  usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  defaultRpcUrls: [
    "https://polygon-rpc.com",
    "https://polygon-bor-rpc.publicnode.com",
  ],
  explorerUrl: "https://polygonscan.com",
  supportsFastTransfer: false,
};

export const Unichain: EvmCctpChain = {
  name: "Unichain",
  label: "Unichain",
  ecosystem: "evm",
  network: "mainnet",
  evmChainId: 130,
  cctpDomain: 10,
  usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  defaultRpcUrls: ["https://mainnet.unichain.org"],
  explorerUrl: "https://uniscan.xyz",
  supportsFastTransfer: true,
};

export const Linea: EvmCctpChain = {
  name: "Linea",
  label: "Linea",
  ecosystem: "evm",
  network: "mainnet",
  evmChainId: 59144,
  cctpDomain: 11,
  usdc: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  defaultRpcUrls: ["https://rpc.linea.build"],
  explorerUrl: "https://lineascan.build",
  supportsFastTransfer: true,
};

export const WorldChain: EvmCctpChain = {
  name: "WorldChain",
  label: "World Chain",
  ecosystem: "evm",
  network: "mainnet",
  evmChainId: 480,
  cctpDomain: 14,
  usdc: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  defaultRpcUrls: ["https://worldchain-mainnet.g.alchemy.com/public"],
  explorerUrl: "https://worldscan.org",
  supportsFastTransfer: true,
};

import { Solana } from "./solana.js";

export const MAINNET_CHAINS = [
  Ethereum,
  Avalanche,
  Optimism,
  Arbitrum,
  Base,
  Polygon,
  Unichain,
  Linea,
  WorldChain,
  Solana,
] as const satisfies readonly CctpChain[];
