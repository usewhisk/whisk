import {
  BASE_FEE,
  TransactionBuilder,
  rpc as sorobanRpc,
} from "@stellar/stellar-sdk";
import type { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { toWhiskError, type StellarAdapter } from "@usewhisk/core";
import type { StellarConfig } from "../config/adapters/stellar.js";

/**
 * Invocations are simulated, signed and submitted one at a time, each
 * waiting for the last to land. Errors are thrown as `WhiskError`s.
 */
export function createStellarAdapter(
  kit: StellarWalletsKit,
  address: string,
  config: StellarConfig,
  rpcServer: sorobanRpc.Server = new sorobanRpc.Server(config.rpcUrl),
): StellarAdapter {
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

          const assembled = sorobanRpc.assembleTransaction(baseTx, sim).build();
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

          // The burn can only spend the allowance once the approve lands.
          const deadline = Date.now() + 60_000;
          let landed = false;
          while (Date.now() < deadline) {
            const status = await rpcServer.getTransaction(sendResponse.hash);
            if (status.status === sorobanRpc.Api.GetTransactionStatus.SUCCESS) {
              landed = true;
              break;
            }
            if (status.status === sorobanRpc.Api.GetTransactionStatus.FAILED) {
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
        // `submitInvocation` already waits for each tx, so this poll is
        // for hashes that came from elsewhere.
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
}
