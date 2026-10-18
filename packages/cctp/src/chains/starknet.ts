import type { StarknetChain } from "./types.js";
import {
  MESSAGE_TRANSMITTER_V2_STARKNET_MAINNET,
  MESSAGE_TRANSMITTER_V2_STARKNET_SEPOLIA,
  STARKNET_CCTP_DOMAIN,
  STARKNET_CHAIN_ID_MAINNET,
  STARKNET_CHAIN_ID_SEPOLIA,
  TOKEN_MESSENGER_MINTER_V2_STARKNET_MAINNET,
  TOKEN_MESSENGER_MINTER_V2_STARKNET_SEPOLIA,
  USDC_STARKNET_MAINNET,
  USDC_STARKNET_SEPOLIA,
} from "./constants.js";

export const Starknet = {
  id: "Starknet",
  label: "Starknet",
  ecosystem: "starknet",
  network: "mainnet",
  starknetNetwork: "mainnet",
  chainId: STARKNET_CHAIN_ID_MAINNET,
  cctpDomain: STARKNET_CCTP_DOMAIN,
  usdc: USDC_STARKNET_MAINNET,
  usdcDecimals: 6,
  tokenMessengerMinter: TOKEN_MESSENGER_MINTER_V2_STARKNET_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_STARKNET_MAINNET,
  nativeCurrency: { symbol: "STRK", decimals: 18 },
  defaultRpcUrls: ["https://starknet-rpc.publicnode.com"],
  explorerUrl: "https://voyager.online",
  capabilities: {
    fastSource: true,
    forwardingDestination: false,
    upfrontFeeSource: false,
  },
} as const satisfies StarknetChain;

export const StarknetSepolia = {
  id: "Starknet_Sepolia",
  label: "Starknet Sepolia",
  ecosystem: "starknet",
  network: "testnet",
  starknetNetwork: "sepolia",
  chainId: STARKNET_CHAIN_ID_SEPOLIA,
  cctpDomain: STARKNET_CCTP_DOMAIN,
  usdc: USDC_STARKNET_SEPOLIA,
  usdcDecimals: 6,
  tokenMessengerMinter: TOKEN_MESSENGER_MINTER_V2_STARKNET_SEPOLIA,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_STARKNET_SEPOLIA,
  nativeCurrency: { symbol: "STRK", decimals: 18 },
  defaultRpcUrls: ["https://starknet-sepolia-rpc.publicnode.com"],
  explorerUrl: "https://sepolia.voyager.online",
  capabilities: {
    fastSource: true,
    forwardingDestination: false,
    upfrontFeeSource: false,
  },
} as const satisfies StarknetChain;
