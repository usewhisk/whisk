import { Asset } from "@stellar/stellar-sdk";
import type { StellarChain } from "./types.js";
import {
  CCTP_FORWARDER_STELLAR_MAINNET,
  CCTP_FORWARDER_STELLAR_TESTNET,
  MESSAGE_TRANSMITTER_STELLAR_MAINNET,
  MESSAGE_TRANSMITTER_STELLAR_TESTNET,
  STELLAR_CCTP_DOMAIN,
  STELLAR_NETWORK_PASSPHRASE_MAINNET,
  STELLAR_NETWORK_PASSPHRASE_TESTNET,
  STELLAR_USDC_DECIMALS,
  TOKEN_MESSENGER_MINTER_STELLAR_MAINNET,
  TOKEN_MESSENGER_MINTER_STELLAR_TESTNET,
  USDC_ISSUER_STELLAR_MAINNET,
  USDC_ISSUER_STELLAR_TESTNET,
} from "./constants.js";

function deriveUsdcSac(issuer: string, passphrase: string): string {
  return new Asset("USDC", issuer).contractId(passphrase);
}

const USDC_SAC_STELLAR_MAINNET = deriveUsdcSac(
  USDC_ISSUER_STELLAR_MAINNET,
  STELLAR_NETWORK_PASSPHRASE_MAINNET,
);
const USDC_SAC_STELLAR_TESTNET = deriveUsdcSac(
  USDC_ISSUER_STELLAR_TESTNET,
  STELLAR_NETWORK_PASSPHRASE_TESTNET,
);

export const Stellar = {
  id: "Stellar",
  label: "Stellar",
  ecosystem: "stellar",
  network: "mainnet",
  stellarNetwork: "public",
  networkPassphrase: STELLAR_NETWORK_PASSPHRASE_MAINNET,
  cctpDomain: STELLAR_CCTP_DOMAIN,
  usdcIssuer: USDC_ISSUER_STELLAR_MAINNET,
  usdc: USDC_SAC_STELLAR_MAINNET,
  usdcDecimals: STELLAR_USDC_DECIMALS,
  tokenMessengerMinter: TOKEN_MESSENGER_MINTER_STELLAR_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_STELLAR_MAINNET,
  cctpForwarder: CCTP_FORWARDER_STELLAR_MAINNET,
  nativeCurrency: { symbol: "XLM", decimals: 7 },
  defaultRpcUrls: [
    "https://soroban-rpc.mainnet.stellar.gateway.fm",
    "https://mainnet.sorobanrpc.com",
  ],
  explorerUrl: "https://stellar.expert/explorer/public",
  capabilities: {
    fastSource: false,
    forwardingDestination: false,
    upfrontFeeSource: false,
  },
} as const satisfies StellarChain;

export const StellarTestnet = {
  id: "Stellar_Testnet",
  label: "Stellar Testnet",
  ecosystem: "stellar",
  network: "testnet",
  stellarNetwork: "testnet",
  networkPassphrase: STELLAR_NETWORK_PASSPHRASE_TESTNET,
  cctpDomain: STELLAR_CCTP_DOMAIN,
  usdcIssuer: USDC_ISSUER_STELLAR_TESTNET,
  usdc: USDC_SAC_STELLAR_TESTNET,
  usdcDecimals: STELLAR_USDC_DECIMALS,
  tokenMessengerMinter: TOKEN_MESSENGER_MINTER_STELLAR_TESTNET,
  messageTransmitter: MESSAGE_TRANSMITTER_STELLAR_TESTNET,
  cctpForwarder: CCTP_FORWARDER_STELLAR_TESTNET,
  nativeCurrency: { symbol: "XLM", decimals: 7 },
  defaultRpcUrls: ["https://soroban-testnet.stellar.org"],
  explorerUrl: "https://stellar.expert/explorer/testnet",
  capabilities: {
    fastSource: false,
    forwardingDestination: false,
    upfrontFeeSource: false,
  },
} as const satisfies StellarChain;
