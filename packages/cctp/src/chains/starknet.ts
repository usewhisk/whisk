/**
 * CCTP V2 Starknet chains (mainnet + Sepolia testnet).
 *
 * Domain 25. Starknet's CCTP V2 is implemented as two Cairo contracts:
 * `TokenMessengerMinterV2` (burns + mints) and `MessageTransmitterV2`
 * (sends + receives attested messages).
 *
 * USDC on Starknet behaves like an ERC-20 — the burn call uses the
 * standard `transferFrom` allowance pattern, so callers must `approve`
 * the TokenMessenger before `deposit_for_burn`. The engine handles that
 * approve step automatically.
 */
import type { StarknetCctpChain } from "./types.js";
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

export const Starknet: StarknetCctpChain = {
  ecosystem: "starknet",
  name: "Starknet",
  label: "Starknet",
  network: "mainnet",
  starknetNetwork: "mainnet",
  chainId: STARKNET_CHAIN_ID_MAINNET,
  cctpDomain: STARKNET_CCTP_DOMAIN,
  usdc: USDC_STARKNET_MAINNET,
  tokenMessengerMinter: TOKEN_MESSENGER_MINTER_V2_STARKNET_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_STARKNET_MAINNET,
  defaultRpcUrls: ["https://starknet-mainnet.public.blastapi.io/rpc/v0_8"],
  explorerUrl: "https://voyager.online",
  supportsFastTransfer: true,
};

export const StarknetSepolia: StarknetCctpChain = {
  ecosystem: "starknet",
  name: "StarknetSepolia",
  label: "Starknet Sepolia",
  network: "testnet",
  starknetNetwork: "sepolia",
  chainId: STARKNET_CHAIN_ID_SEPOLIA,
  cctpDomain: STARKNET_CCTP_DOMAIN,
  usdc: USDC_STARKNET_SEPOLIA,
  tokenMessengerMinter: TOKEN_MESSENGER_MINTER_V2_STARKNET_SEPOLIA,
  messageTransmitter: MESSAGE_TRANSMITTER_V2_STARKNET_SEPOLIA,
  defaultRpcUrls: ["https://starknet-sepolia.public.blastapi.io/rpc/v0_8"],
  explorerUrl: "https://sepolia.voyager.online",
  supportsFastTransfer: true,
};
