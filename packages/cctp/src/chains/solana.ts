/**
 * CCTP V2 Solana chains.
 *
 * Both mainnet-beta and devnet share the same program IDs; only the
 * USDC SPL mint differs. The cluster discriminator picks the right RPC
 * + USDC mint.
 */
import type { SolanaCctpChain } from "./types.js";
import {
  MESSAGE_TRANSMITTER_V2_SOLANA,
  SOLANA_CCTP_DOMAIN,
  TOKEN_MESSENGER_MINTER_V2_SOLANA,
  USDC_SPL_DEVNET,
  USDC_SPL_MAINNET,
} from "./constants.js";

export const Solana: SolanaCctpChain = {
  ecosystem: "solana",
  name: "Solana",
  label: "Solana",
  network: "mainnet",
  cluster: "mainnet-beta",
  cctpDomain: SOLANA_CCTP_DOMAIN,
  usdc: USDC_SPL_MAINNET,
  tokenMessengerMinter: TOKEN_MESSENGER_MINTER_V2_SOLANA,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_SOLANA,
  defaultRpcUrls: ["https://api.mainnet-beta.solana.com"],
  explorerUrl: "https://solscan.io",
  supportsFastTransfer: true,
};

export const SolanaDevnet: SolanaCctpChain = {
  ecosystem: "solana",
  name: "SolanaDevnet",
  label: "Solana Devnet",
  network: "testnet",
  cluster: "devnet",
  cctpDomain: SOLANA_CCTP_DOMAIN,
  usdc: USDC_SPL_DEVNET,
  tokenMessengerMinter: TOKEN_MESSENGER_MINTER_V2_SOLANA,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_SOLANA,
  defaultRpcUrls: ["https://api.devnet.solana.com"],
  explorerUrl: "https://solscan.io",
  supportsFastTransfer: true,
};
