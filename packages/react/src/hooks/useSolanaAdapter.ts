"use client";

import { useMemo } from "react";
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { toWhiskError, type SolanaAdapter } from "@usewhisk/core";
import type { SolanaConfig } from "../config/adapters/solana.js";
import { useWhiskContext } from "./useWhiskContext.js";

/**
 * Build a Whisk `SolanaAdapter` from the surrounding Wallet Standard
 * context (mounted by `WhiskProvider` when a `solana()` factory is in
 * `config.wallets`).
 *
 * Returns `null` until the user connects a Solana wallet (Phantom,
 * Solflare, Backpack, etc. — anything that advertises via Wallet
 * Standard). Once connected, the adapter:
 *
 *   - `address`           → connected wallet's pubkey (base58)
 *   - `getCluster`        → cluster the provider was mounted with
 *   - `sendTransaction`   → builds a `Transaction`, partial-signs with
 *                            any `extraSigners` (the engine's ephemeral
 *                            keypair for CCTP burns), then asks the
 *                            wallet to sign + submit
 *   - `confirmTransaction` → polls the cluster via the active RPC until
 *                            the tx lands at the wallet's preferred
 *                            commitment
 *
 * Wallet rejections, network blowups, and on-chain failures are
 * converted to typed `WhiskError`s via `toWhiskError` so the engine
 * surfaces them with stable categories.
 */
export function useSolanaAdapter(): SolanaAdapter | null {
  const { config } = useWhiskContext();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const solanaConfig = useMemo(
    () =>
      (config.wallets.find((w) => w.kind === "solana")?.config as
        | SolanaConfig
        | undefined) ?? null,
    [config.wallets],
  );

  return useMemo<SolanaAdapter | null>(() => {
    if (!connected || !publicKey || !solanaConfig) return null;
    const cluster: "mainnet-beta" | "devnet" =
      solanaConfig.network === "mainnet-beta" ? "mainnet-beta" : "devnet";

    return {
      kind: "solana",
      address: publicKey.toBase58(),

      async getCluster() {
        return cluster;
      },

      async sendTransaction(instructions, options) {
        try {
          // Translate engine's `SolanaInstruction` (a serialization-friendly
          // record) into viem-style `TransactionInstruction` objects the
          // Solana library understands. Same fields; just the class.
          const ixs = instructions.map(
            (ix) =>
              new TransactionInstruction({
                programId: new PublicKey(ix.programId),
                keys: ix.keys.map((k) => ({
                  pubkey: new PublicKey(k.pubkey),
                  isSigner: k.isSigner,
                  isWritable: k.isWritable,
                })),
                data: Buffer.from(ix.data),
              }),
          );

          const tx = new Transaction();
          tx.add(...ixs);
          tx.feePayer = publicKey;
          const { blockhash, lastValidBlockHeight } =
            await connection.getLatestBlockhash();
          tx.recentBlockhash = blockhash;
          tx.lastValidBlockHeight = lastValidBlockHeight;

          // Engine-provided ephemeral signers (e.g. the
          // `message_sent_event_data` keypair for CCTP burns). Reconstruct
          // a `Keypair` from the raw secret so we can partial-sign.
          if (options?.extraSigners && options.extraSigners.length > 0) {
            const keypairs = options.extraSigners.map((s) =>
              Keypair.fromSecretKey(s.secretKey),
            );
            tx.partialSign(...keypairs);
          }

          // Hands off to the wallet for the user's signature + submit.
          // `signers` here is empty because we already partial-signed
          // above; passing them again would prompt duplicate signatures.
          const signature = await sendTransaction(tx, connection, {
            signers: [],
            skipPreflight: false,
          });
          return { signature };
        } catch (cause) {
          throw toWhiskError(cause, "Failed to submit Solana transaction.");
        }
      },

      async confirmTransaction(signature) {
        try {
          const result = await connection.confirmTransaction(
            signature,
            "confirmed",
          );
          return {
            status: result.value.err ? "reverted" : "success",
            slot: 0n, // Solana's `confirmTransaction` doesn't return the slot
          };
        } catch (cause) {
          throw toWhiskError(cause, "Failed waiting for Solana confirmation.");
        }
      },

      async getAccountInfo(pubkey) {
        try {
          const info = await connection.getAccountInfo(new PublicKey(pubkey));
          if (!info) return null;
          return { data: new Uint8Array(info.data) };
        } catch (cause) {
          throw toWhiskError(cause, "Failed to read Solana account.");
        }
      },
    };
  }, [connected, publicKey, solanaConfig, connection, sendTransaction]);
}
