/**
 * CCTP V2 EVM testnet chains.
 *
 * One row per mainnet counterpart. Domain IDs match mainnet — Circle
 * treats testnet and mainnet as the same domain.
 */
import type { CctpChain, EvmCctpChain } from "./types.js";
import {
  TOKEN_MESSENGER_V2_EVM_TESTNET,
  MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
} from "./constants.js";

export const EthereumSepolia: EvmCctpChain = {
  name: "EthereumSepolia",
  label: "Ethereum Sepolia",
  ecosystem: "evm",
  network: "testnet",
  evmChainId: 11155111,
  cctpDomain: 0,
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_TESTNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  defaultRpcUrls: [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://eth-sepolia.public.blastapi.io",
  ],
  explorerUrl: "https://sepolia.etherscan.io",
  supportsFastTransfer: true,
};

export const AvalancheFuji: EvmCctpChain = {
  name: "AvalancheFuji",
  label: "Avalanche Fuji",
  ecosystem: "evm",
  network: "testnet",
  evmChainId: 43113,
  cctpDomain: 1,
  usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_TESTNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  defaultRpcUrls: [
    "https://api.avax-test.network/ext/bc/C/rpc",
    "https://avalanche-fuji-c-chain-rpc.publicnode.com",
  ],
  explorerUrl: "https://testnet.snowtrace.io",
  supportsFastTransfer: false,
};

export const OptimismSepolia: EvmCctpChain = {
  name: "OptimismSepolia",
  label: "OP Sepolia",
  ecosystem: "evm",
  network: "testnet",
  evmChainId: 11155420,
  cctpDomain: 2,
  usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_TESTNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  defaultRpcUrls: [
    "https://sepolia.optimism.io",
    "https://optimism-sepolia-rpc.publicnode.com",
  ],
  explorerUrl: "https://sepolia-optimism.etherscan.io",
  supportsFastTransfer: true,
};

export const ArbitrumSepolia: EvmCctpChain = {
  name: "ArbitrumSepolia",
  label: "Arbitrum Sepolia",
  ecosystem: "evm",
  network: "testnet",
  evmChainId: 421614,
  cctpDomain: 3,
  usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_TESTNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  defaultRpcUrls: [
    "https://sepolia-rollup.arbitrum.io/rpc",
    "https://arbitrum-sepolia-rpc.publicnode.com",
  ],
  explorerUrl: "https://sepolia.arbiscan.io",
  supportsFastTransfer: true,
};

export const BaseSepolia: EvmCctpChain = {
  name: "BaseSepolia",
  label: "Base Sepolia",
  ecosystem: "evm",
  network: "testnet",
  evmChainId: 84532,
  cctpDomain: 6,
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_TESTNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  defaultRpcUrls: [
    "https://sepolia.base.org",
    "https://base-sepolia-rpc.publicnode.com",
  ],
  explorerUrl: "https://sepolia.basescan.org",
  supportsFastTransfer: true,
};

export const PolygonAmoy: EvmCctpChain = {
  name: "PolygonAmoy",
  label: "Polygon Amoy",
  ecosystem: "evm",
  network: "testnet",
  evmChainId: 80002,
  cctpDomain: 7,
  usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_TESTNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  defaultRpcUrls: [
    "https://rpc-amoy.polygon.technology",
    "https://polygon-amoy-bor-rpc.publicnode.com",
  ],
  explorerUrl: "https://amoy.polygonscan.com",
  supportsFastTransfer: false,
};

export const UnichainSepolia: EvmCctpChain = {
  name: "UnichainSepolia",
  label: "Unichain Sepolia",
  ecosystem: "evm",
  network: "testnet",
  evmChainId: 1301,
  cctpDomain: 10,
  usdc: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_TESTNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  defaultRpcUrls: ["https://sepolia.unichain.org"],
  explorerUrl: "https://unichain-sepolia.blockscout.com",
  supportsFastTransfer: true,
};

export const LineaSepolia: EvmCctpChain = {
  name: "LineaSepolia",
  label: "Linea Sepolia",
  ecosystem: "evm",
  network: "testnet",
  evmChainId: 59141,
  cctpDomain: 11,
  usdc: "0xFEce4462D57bD51A6A552365A011b95f0E16d9B7",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_TESTNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  defaultRpcUrls: ["https://rpc.sepolia.linea.build"],
  explorerUrl: "https://sepolia.lineascan.build",
  supportsFastTransfer: true,
};

export const WorldChainSepolia: EvmCctpChain = {
  name: "WorldChainSepolia",
  label: "World Chain Sepolia",
  ecosystem: "evm",
  network: "testnet",
  evmChainId: 4801,
  cctpDomain: 14,
  usdc: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88",
  tokenMessenger: TOKEN_MESSENGER_V2_EVM_TESTNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  defaultRpcUrls: ["https://worldchain-sepolia.g.alchemy.com/public"],
  explorerUrl: "https://sepolia.worldscan.org",
  supportsFastTransfer: true,
};

import { SolanaDevnet } from "./solana.js";

export const TESTNET_CHAINS = [
  EthereumSepolia,
  AvalancheFuji,
  OptimismSepolia,
  ArbitrumSepolia,
  BaseSepolia,
  PolygonAmoy,
  UnichainSepolia,
  LineaSepolia,
  WorldChainSepolia,
  SolanaDevnet,
] as const satisfies readonly CctpChain[];
