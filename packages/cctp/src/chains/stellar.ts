/**
 * CCTP V2 Stellar chains (mainnet + testnet).
 *
 * Domain 27. Stellar's CCTP V2 is implemented as three Soroban
 * contracts: TokenMessengerMinter (burn + mint), MessageTransmitter
 * (attestation routing), and CctpForwarder (mandatory entry point on
 * the destination side).
 *
 * The USDC Stellar Asset Contract (SAC) isn't a deployed contract —
 * it's deterministically derived from the asset code, issuer pubkey,
 * and network passphrase. We compute it at module load via the
 * Stellar SDK so consumers don't need to hardcode it.
 */
import { Asset } from "@stellar/stellar-sdk";
import type { StellarCctpChain } from "./types.js";
import {
  CCTP_FORWARDER_STELLAR_MAINNET,
  CCTP_FORWARDER_STELLAR_TESTNET,
  MESSAGE_TRANSMITTER_STELLAR_MAINNET,
  MESSAGE_TRANSMITTER_STELLAR_TESTNET,
  STELLAR_CCTP_DOMAIN,
  STELLAR_NETWORK_PASSPHRASE_MAINNET,
  STELLAR_NETWORK_PASSPHRASE_TESTNET,
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

export const Stellar: StellarCctpChain = {
  ecosystem: "stellar",
  name: "Stellar",
  label: "Stellar",
  network: "mainnet",
  stellarNetwork: "public",
  networkPassphrase: STELLAR_NETWORK_PASSPHRASE_MAINNET,
  cctpDomain: STELLAR_CCTP_DOMAIN,
  usdcIssuer: USDC_ISSUER_STELLAR_MAINNET,
  usdc: USDC_SAC_STELLAR_MAINNET,
  tokenMessengerMinter: TOKEN_MESSENGER_MINTER_STELLAR_MAINNET,
  messageTransmitter: MESSAGE_TRANSMITTER_STELLAR_MAINNET,
  cctpForwarder: CCTP_FORWARDER_STELLAR_MAINNET,
  defaultRpcUrls: ["https://mainnet.sorobanrpc.com"],
  explorerUrl: "https://stellar.expert/explorer/public",
  supportsFastTransfer: true,
};

export const StellarTestnet: StellarCctpChain = {
  ecosystem: "stellar",
  name: "StellarTestnet",
  label: "Stellar Testnet",
  network: "testnet",
  stellarNetwork: "testnet",
  networkPassphrase: STELLAR_NETWORK_PASSPHRASE_TESTNET,
  cctpDomain: STELLAR_CCTP_DOMAIN,
  usdcIssuer: USDC_ISSUER_STELLAR_TESTNET,
  usdc: USDC_SAC_STELLAR_TESTNET,
  tokenMessengerMinter: TOKEN_MESSENGER_MINTER_STELLAR_TESTNET,
  messageTransmitter: MESSAGE_TRANSMITTER_STELLAR_TESTNET,
  cctpForwarder: CCTP_FORWARDER_STELLAR_TESTNET,
  defaultRpcUrls: ["https://soroban-testnet.stellar.org"],
  explorerUrl: "https://stellar.expert/explorer/testnet",
  supportsFastTransfer: true,
};
