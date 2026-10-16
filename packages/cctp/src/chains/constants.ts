/**
 * Shared CCTP V2 program / contract addresses.
 *
 * EVM: same address across every mainnet chain, same address across
 * every testnet chain.
 *
 * Solana: program IDs are the same across mainnet-beta and devnet;
 * only the USDC SPL mint differs by cluster. CCTP V2 on Solana merges
 * TokenMessenger + TokenMinter into a single `TokenMessengerMinter`
 * Anchor program.
 */
import type {
  Address,
  SolanaPubkey,
  StarknetFelt,
  StellarStrkey,
} from "./types.js";

/* ─── EVM ─────────────────────────────────────────────────────────── */

export const TOKEN_MESSENGER_V2_EVM_MAINNET: Address =
  "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";

export const MESSAGE_TRANSMITTER_V2_EVM_MAINNET: Address =
  "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";

export const TOKEN_MESSENGER_V2_EVM_TESTNET: Address =
  "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";

export const MESSAGE_TRANSMITTER_V2_EVM_TESTNET: Address =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

/* ─── Solana ──────────────────────────────────────────────────────── */

/** `TokenMessengerMinterV2` program ID (same on mainnet-beta + devnet). */
export const TOKEN_MESSENGER_MINTER_V2_SOLANA: SolanaPubkey =
  "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe";

/** `MessageTransmitterV2` program ID (same on mainnet-beta + devnet). */
export const MESSAGE_TRANSMITTER_V2_SOLANA: SolanaPubkey =
  "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC";

/** USDC SPL mint on Solana mainnet-beta. */
export const USDC_SPL_MAINNET: SolanaPubkey =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** USDC SPL mint on Solana devnet. */
export const USDC_SPL_DEVNET: SolanaPubkey =
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/** Circle-assigned CCTP domain ID for Solana. */
export const SOLANA_CCTP_DOMAIN = 5 as const;

/* ─── Stellar ─────────────────────────────────────────────────────── */

/**
 * Stellar's CCTP V2 contract IDs (Soroban contract strkeys). Each
 * network has its own deployment. Contract names mirror Circle's
 * naming on the Stellar contracts reference page.
 */
export const TOKEN_MESSENGER_MINTER_STELLAR_MAINNET: StellarStrkey =
  "CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL";
export const MESSAGE_TRANSMITTER_STELLAR_MAINNET: StellarStrkey =
  "CACMENFFJPJMSDAJQLX4R7K3SFZIW2LJSE3R2UMLGSWHFHS353FVXAZV";
export const CCTP_FORWARDER_STELLAR_MAINNET: StellarStrkey =
  "CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T";

export const TOKEN_MESSENGER_MINTER_STELLAR_TESTNET: StellarStrkey =
  "CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP";
export const MESSAGE_TRANSMITTER_STELLAR_TESTNET: StellarStrkey =
  "CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY";
export const CCTP_FORWARDER_STELLAR_TESTNET: StellarStrkey =
  "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ";

/** Circle's USDC issuer on Stellar mainnet (Centre). */
export const USDC_ISSUER_STELLAR_MAINNET: StellarStrkey =
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
/** Circle's USDC issuer on Stellar testnet. */
export const USDC_ISSUER_STELLAR_TESTNET: StellarStrkey =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

/** Stellar network passphrases — required when signing Soroban transactions. */
export const STELLAR_NETWORK_PASSPHRASE_MAINNET =
  "Public Global Stellar Network ; September 2015" as const;
export const STELLAR_NETWORK_PASSPHRASE_TESTNET =
  "Test SDF Network ; September 2015" as const;

/** Circle-assigned CCTP domain ID for Stellar. */
export const STELLAR_CCTP_DOMAIN = 27 as const;

/**
 * Stellar's USDC asset uses 7 decimals natively while CCTP messages
 * always use 6. Burn from Stellar drops the 7th decimal; mint to Stellar
 * scales the 6-decimal subunits by 10.
 */
export const STELLAR_USDC_DECIMALS = 7 as const;
export const CCTP_USDC_DECIMALS = 6 as const;

/* ─── Starknet ────────────────────────────────────────────────────── */

export const TOKEN_MESSENGER_MINTER_V2_STARKNET_MAINNET: StarknetFelt =
  "0x07d421B9cA8aA32DF259965cDA8ACb93F7599F69209A41872AE84638B2A20F2a";
export const MESSAGE_TRANSMITTER_V2_STARKNET_MAINNET: StarknetFelt =
  "0x02EBB5777B6dD8B26ea11D68Fdf1D2c85cD2099335328Be845a28c77A8AEf183";

export const TOKEN_MESSENGER_MINTER_V2_STARKNET_SEPOLIA: StarknetFelt =
  "0x04bDdE1E09a4B09a2F95d893D94a967b7717eB85A3f6dEcA8c080Ee01fBc3370";
export const MESSAGE_TRANSMITTER_V2_STARKNET_SEPOLIA: StarknetFelt =
  "0x04db7926C64f1f32a840F3Fa95cB551f3801a3600Bae87aF87807A54DCE12Fe8";

export const USDC_STARKNET_MAINNET: StarknetFelt =
  "0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb";
export const USDC_STARKNET_SEPOLIA: StarknetFelt =
  "0x0512feAc6339Ff7889822cb5aA2a86C848e9D392bB0E3E237C008674feeD8343";

/**
 * Starknet chain IDs — shortstring felts. `SN_MAIN` and `SN_SEPOLIA`
 * encoded as bytes-to-felt. Wallets compare against these when signing.
 */
export const STARKNET_CHAIN_ID_MAINNET: StarknetFelt = "0x534e5f4d41494e"; // SN_MAIN
export const STARKNET_CHAIN_ID_SEPOLIA: StarknetFelt = "0x534e5f5345504f4c4941"; // SN_SEPOLIA

/** Circle-assigned CCTP domain ID for Starknet. */
export const STARKNET_CCTP_DOMAIN = 25 as const;
