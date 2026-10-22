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
 * The connected Wallet Standard wallet as a `SolanaAdapter`, or `null` when
 * none is connected or `config.wallets` has no `solana()` factory. Wallet
 * errors are thrown as `WhiskError`s.
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

          // The engine's one-off keypairs, such as the CCTP burn's
          // `message_sent_event_data` account, sign before the wallet does.
          if (options?.extraSigners && options.extraSigners.length > 0) {
            const keypairs = options.extraSigners.map((s) =>
              Keypair.fromSecretKey(s.secretKey),
            );
            tx.partialSign(...keypairs);
          }

          // `signers` stays empty: passing the keypairs again would sign twice.
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
            slot: 0n, // `confirmTransaction` does not return the slot
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
