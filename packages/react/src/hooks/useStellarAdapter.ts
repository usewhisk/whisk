"use client";

import { useMemo } from "react";
import {
  BASE_FEE,
  TransactionBuilder,
  rpc as sorobanRpc,
} from "@stellar/stellar-sdk";
import { toWhiskError, type StellarAdapter } from "@usewhisk/core";
import { useStellarWallet } from "../provider/stellarContext.js";

/**
 * Build a Whisk `StellarAdapter` from the surrounding Stellar Wallets Kit
 * context (mounted by `WhiskProvider` when a `stellar()` factory is in
 * `config.wallets`).
 *
 * Returns `null` until the user picks + connects a wallet via the
 * `ConnectModal`. Once connected, the adapter:
 *
 *   - `address`             → connected wallet's G-address
 *   - `getNetwork`          → `"public"` / `"testnet"` from the factory
 *   - `submitInvocation`    → for each Soroban invocation: builds a tx,
 *                              simulates, assembles, asks the kit to
 *                              sign, then submits via Stellar RPC.
 *                              Sequential — approve→burn ordering is
 *                              preserved.
 *   - `confirmTransaction`  → polls Stellar RPC until SUCCESS / FAILED
 *   - `getLatestLedger`     → current ledger sequence (the engine uses
 *                              it to compute `expiration_ledger` for
 *                              USDC SAC `approve`)
 *
 * Errors are routed through `toWhiskError` so the engine surfaces them
 * with stable categories.
 */
export function useStellarAdapter(): StellarAdapter | null {
  const stellar = useStellarWallet();

  return useMemo<StellarAdapter | null>(() => {
    if (!stellar || !stellar.address) return null;
    const { kit, address, config } = stellar;
    const rpcServer = new sorobanRpc.Server(config.rpcUrl);
    const network: "public" | "testnet" = config.network;
    const networkPassphrase = config.networkPassphrase;

    return {
      kind: "stellar",
      address,

      async getNetwork() {
        return network;
      },

      async getLatestLedger() {
        try {
          const info = await rpcServer.getLatestLedger();
          return info.sequence;
        } catch (cause) {
          throw toWhiskError(cause, "Failed to read Stellar latest ledger.");
        }
      },

      async submitInvocation(invocations) {
        const hashes: string[] = [];
        for (const inv of invocations) {
          try {
            const sourceAccount = await rpcServer.getAccount(address);
            const baseTx = new TransactionBuilder(sourceAccount, {
              fee: BASE_FEE,
              networkPassphrase,
            })
              .addOperation(inv.operation)
              .setTimeout(180)
              .build();

            const sim = await rpcServer.simulateTransaction(baseTx);
            if (sorobanRpc.Api.isSimulationError(sim)) {
              throw new Error(
                `Stellar simulation error (${inv.functionName}): ${sim.error}`,
              );
            }

            const assembled = sorobanRpc
              .assembleTransaction(baseTx, sim)
              .build();
            const xdr = assembled.toXDR();

            const { signedTxXdr } = await kit.signTransaction(xdr, {
              networkPassphrase,
              address,
            });

            const signedTx = TransactionBuilder.fromXDR(
              signedTxXdr,
              networkPassphrase,
            );
            const sendResponse = await rpcServer.sendTransaction(signedTx);
            if (sendResponse.status !== "PENDING") {
              throw new Error(
                `Stellar submit failed (${inv.functionName}): ${sendResponse.status} ${JSON.stringify(sendResponse.errorResult ?? {})}`,
              );
            }
            hashes.push(sendResponse.hash);

            // Wait for this tx to land before submitting the next one —
            // approve must land before burn can use the allowance.
            const deadline = Date.now() + 60_000;
            let landed = false;
            while (Date.now() < deadline) {
              const status = await rpcServer.getTransaction(sendResponse.hash);
              if (
                status.status === sorobanRpc.Api.GetTransactionStatus.SUCCESS
              ) {
                landed = true;
                break;
              }
              if (
                status.status === sorobanRpc.Api.GetTransactionStatus.FAILED
              ) {
                throw new Error(
                  `Stellar tx ${sendResponse.hash} reverted (${inv.functionName}).`,
                );
              }
              await new Promise((r) => setTimeout(r, 2000));
            }
            if (!landed) {
              throw new Error(
                `Stellar tx ${sendResponse.hash} did not land within 60s (${inv.functionName}).`,
              );
            }
          } catch (cause) {
            throw toWhiskError(
              cause,
              `Failed to submit Stellar invocation (${inv.functionName}).`,
            );
          }
        }
        return { hashes };
      },

      async confirmTransaction(hash) {
        try {
          // Submitted txs are awaited inline in submitInvocation, so by
          // the time this fires the tx is usually already on chain.
          // Keep a short poll for callers that confirm out-of-band.
          const deadline = Date.now() + 60_000;
          while (Date.now() < deadline) {
            const status = await rpcServer.getTransaction(hash);
            if (status.status === sorobanRpc.Api.GetTransactionStatus.SUCCESS) {
              return { status: "success" as const, ledger: status.ledger };
            }
            if (status.status === sorobanRpc.Api.GetTransactionStatus.FAILED) {
              return {
                status: "reverted" as const,
                ledger: status.ledger ?? 0,
              };
            }
            await new Promise((r) => setTimeout(r, 2000));
          }
          throw new Error(`Stellar tx ${hash} did not confirm within 60s.`);
        } catch (cause) {
          throw toWhiskError(cause, "Failed waiting for Stellar confirmation.");
        }
      },
    };
  }, [stellar]);
}
