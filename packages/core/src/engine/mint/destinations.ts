import {
  buildSolanaReceiveIntent,
  buildStarknetReceiveIntent,
  buildStellarMintIntent,
  decodeBurnMessage,
  deriveTokenMessenger,
  deriveUsedNonce,
  isStarknetNonceUsed,
  isStellarNonceUsed,
  parseTokenMessengerFeeRecipient,
  type CctpChain,
  type RpcOptions,
  type SolanaChain,
  type StarknetChain,
  type StellarChain,
} from "@usewhisk/cctp";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  ConfigError,
  OnchainRevertError,
  RouteUnavailableError,
  WrongChainError,
} from "../../errors/errors.js";
import type { WhiskAdapter } from "../types.js";

export type Attested = {
  message: `0x${string}`;
  attestation: `0x${string}`;
};

type NonEvmChain = SolanaChain | StellarChain | StarknetChain;

/**
 * Whether the destination already received this message. Solana is read
 * through the wallet; Stellar and Starknet through their RPCs.
 */
export async function isReceivedOn(
  destination: NonEvmChain,
  attested: Attested,
  adapter: WhiskAdapter | undefined,
  rpc: RpcOptions,
): Promise<boolean> {
  const nonce = decodeBurnMessage(attested.message).nonce;
  if (destination.ecosystem === "stellar") {
    return isStellarNonceUsed(destination, nonce, rpc);
  }
  if (destination.ecosystem === "starknet") {
    return isStarknetNonceUsed(destination, nonce, rpc);
  }
  const wallet = expect(adapter, destination);
  if (wallet.kind !== "solana") throw wrongWallet(destination);
  const usedNonce = deriveUsedNonce(
    new PublicKey(destination.messageTransmitter),
    hexToBytes(attested.message),
  );
  return (await wallet.getAccountInfo(usedNonce.toBase58())) !== null;
}

/** Submits the mint with the destination wallet and waits for it. */
export async function mintOn(
  destination: NonEvmChain,
  attested: Attested,
  adapter: WhiskAdapter | undefined,
): Promise<string> {
  const wallet = expect(adapter, destination);
  if (destination.ecosystem === "solana") {
    if (wallet.kind !== "solana") throw wrongWallet(destination);
    const cluster = await wallet.getCluster();
    if (cluster !== destination.cluster) {
      throw new WrongChainError(
        destination.cluster,
        new Error(`wallet is on ${cluster}`),
      );
    }
    const decoded = decodeBurnMessage(attested.message);
    const tmm = new PublicKey(destination.tokenMessengerMinter);
    const messenger = await wallet.getAccountInfo(
      deriveTokenMessenger(tmm).toBase58(),
    );
    if (!messenger) {
      throw new ConfigError("Solana TokenMessenger state is missing.");
    }
    const usdc = new PublicKey(destination.usdc);
    // The burn named the recipient's USDC account itself.
    const recipientUsdcAta = new PublicKey(
      hexToBytes(decoded.body.mintRecipient),
    );
    if (!(await wallet.getAccountInfo(recipientUsdcAta.toBase58()))) {
      throw new ConfigError(
        `Recipient USDC account ${recipientUsdcAta.toBase58()} does not exist on Solana.`,
      );
    }
    const intent = buildSolanaReceiveIntent({
      destination,
      message: hexToBytes(attested.message),
      attestation: hexToBytes(attested.attestation),
      sourceDomain: decoded.sourceDomain,
      sourceTokenBytes32: hexToBytes(decoded.body.burnToken),
      feeRecipientUsdcAta: getAssociatedTokenAddressSync(
        usdc,
        parseTokenMessengerFeeRecipient(messenger.data),
      ),
      recipientUsdcAta,
      payer: new PublicKey(wallet.address),
    });
    const { signature } = await wallet.sendTransaction([intent.instruction]);
    const receipt = await wallet.confirmTransaction(signature);
    return confirmed(receipt.status, signature, destination);
  }

  if (destination.ecosystem === "stellar") {
    if (wallet.kind !== "stellar") throw wrongWallet(destination);
    const network = await wallet.getNetwork();
    if (network !== destination.stellarNetwork) {
      throw new WrongChainError(
        destination.stellarNetwork,
        new Error(`wallet is on ${network}`),
      );
    }
    const intent = buildStellarMintIntent({
      destination,
      message: hexToBytes(attested.message),
      attestation: hexToBytes(attested.attestation),
    });
    const { hashes } = await wallet.submitInvocation([intent.invocation]);
    const hash = last(hashes, destination);
    const receipt = await wallet.confirmTransaction(hash);
    return confirmed(receipt.status, hash, destination);
  }

  if (wallet.kind !== "starknet") throw wrongWallet(destination);
  const chainId = await wallet.getChainId();
  if (chainId !== destination.chainId) {
    throw new WrongChainError(
      destination.chainId,
      new Error(`wallet is on ${chainId}`),
    );
  }
  const intent = buildStarknetReceiveIntent({
    destination,
    message: attested.message,
    attestation: attested.attestation,
  });
  const { hashes } = await wallet.submitCalls([intent.call]);
  const hash = last(hashes, destination);
  const receipt = await wallet.confirmTransaction(hash);
  return confirmed(receipt.status, hash, destination);
}

function expect(
  adapter: WhiskAdapter | undefined,
  destination: CctpChain,
): WhiskAdapter {
  if (!adapter) {
    throw new RouteUnavailableError(
      "destination_adapter_required",
      `Connect a wallet on ${destination.id} to finish this transfer.`,
      destination.ecosystem,
    );
  }
  return adapter;
}

function wrongWallet(destination: CctpChain): RouteUnavailableError {
  return new RouteUnavailableError(
    "destination_adapter_required",
    `Connect a ${destination.ecosystem} wallet to finish this transfer on ${destination.id}.`,
    destination.ecosystem,
  );
}

function last(hashes: string[], destination: CctpChain): string {
  const hash = hashes[hashes.length - 1];
  if (!hash) {
    throw new ConfigError(
      `The ${destination.id} wallet returned no transaction hash.`,
    );
  }
  return hash;
}

function confirmed(
  status: "success" | "reverted",
  hash: string,
  destination: CctpChain,
): string {
  if (status === "reverted") {
    throw new OnchainRevertError(
      "reverted_onchain",
      `The mint on ${destination.id} reverted (${hash}).`,
      undefined,
      "mint",
    );
  }
  return hash;
}

function hexToBytes(hex: `0x${string}`): Uint8Array {
  const body = hex.slice(2);
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
