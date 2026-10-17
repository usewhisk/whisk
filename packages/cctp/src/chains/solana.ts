import type { SolanaChain } from "./types.js";
import {
  MESSAGE_TRANSMITTER_V2_SOLANA,
  SOLANA_CCTP_DOMAIN,
  TOKEN_MESSENGER_MINTER_V2_SOLANA,
  USDC_SPL_DEVNET,
  USDC_SPL_MAINNET,
} from "./constants.js";

export const Solana = {
  id: "Solana",
  label: "Solana",
  ecosystem: "solana",
  network: "mainnet",
  cluster: "mainnet-beta",
  cctpDomain: SOLANA_CCTP_DOMAIN,
  usdc: USDC_SPL_MAINNET,
  usdcDecimals: 6,
  tokenMessengerMinter: TOKEN_MESSENGER_MINTER_V2_SOLANA,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_SOLANA,
  nativeCurrency: { symbol: "SOL", decimals: 9 },
  defaultRpcUrls: [
    "https://api.mainnet.solana.com",
    "https://api.mainnet-beta.solana.com",
  ],
  explorerUrl: "https://explorer.solana.com",
  capabilities: {
    fastSource: true,
    forwardingDestination: true,
    upfrontFeeSource: false,
  },
} as const satisfies SolanaChain;

export const SolanaDevnet = {
  id: "Solana_Devnet",
  label: "Solana Devnet",
  ecosystem: "solana",
  network: "testnet",
  cluster: "devnet",
  cctpDomain: SOLANA_CCTP_DOMAIN,
  usdc: USDC_SPL_DEVNET,
  usdcDecimals: 6,
  tokenMessengerMinter: TOKEN_MESSENGER_MINTER_V2_SOLANA,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_SOLANA,
  nativeCurrency: { symbol: "SOL", decimals: 9 },
  defaultRpcUrls: ["https://api.devnet.solana.com"],
  explorerUrl: "https://explorer.solana.com",
  explorerQuery: "?cluster=devnet",
  capabilities: {
    fastSource: true,
    forwardingDestination: true,
    upfrontFeeSource: false,
  },
} as const satisfies SolanaChain;
