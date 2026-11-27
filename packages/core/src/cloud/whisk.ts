import type { WhiskEngine } from "../engine/types.js";
import type { Chain } from "../types/chain.js";
import {
  assertScreened,
  type CloudApi,
  type ReportInput,
  type ReportedTransfer,
} from "./api.js";

export interface WhiskCloudEngine extends WhiskEngine {
  /** The Whisk Cloud record of a burn reported from this page, once it answered. */
  transferFor(
    sourceChain: Chain,
    burnTxHash: string,
  ): ReportedTransfer | undefined;
  /** Resolves once every report started so far has finished or given up. */
  settled(): Promise<void>;
}

export interface WhiskCloudDeps {
  api: CloudApi;
  /** Read at each quote, as a refreshed session can change it. */
  failClosed: () => boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Adds Whisk Cloud to an engine. Each quote is screened alongside the fee
 * lookup and refused before anything is signed on a hit. Each burn is
 * reported the moment the wallet returns its hash, and its mint once known;
 * reports run in the background and never fail or delay the payment.
 * Refunds are the merchant's own sends and are neither screened nor
 * reported.
 */
export function withWhiskCloud(
  engine: WhiskEngine,
  deps: WhiskCloudDeps,
): WhiskCloudEngine {
  const transfers = new Map<string, ReportedTransfer>();
  const pending = new Set<Promise<void>>();
  const keyOf = (chain: string, hash: string) =>
    `${chain}:${hash.toLowerCase()}`;

  const report = (input: ReportInput) => {
    const running = deps.api.report(input).then((reported) => {
      if (reported) {
        transfers.set(keyOf(input.sourceChain, input.burnTxHash), reported);
      }
    });
    const tracked = running.finally(() => pending.delete(tracked));
    pending.add(tracked);
  };

  const reportMint = (
    sourceChain: string,
    burnTxHash: string,
    recordId: string,
    mintTxHash: string,
  ) => {
    report({
      sourceChain,
      burnTxHash,
      // A record resumed from a bare hash has no UUID; the burn identifies it anyway.
      clientTransferId: UUID.test(recordId)
        ? recordId
        : globalThis.crypto.randomUUID(),
      mintTxHash,
    });
  };

  return {
    ...engine,

    async quote(params) {
      const [quote, outcome] = await Promise.all([
        engine.quote(params),
        deps.api.screen({
          payer: { chain: params.sourceChain, address: params.adapter.address },
          recipient: {
            chain: params.destinationChain,
            address: params.recipient.address,
          },
        }),
      ]);
      assertScreened(outcome, deps.failClosed());
      return quote;
    },

    async send(params, listeners) {
      const route = params.quote.route;
      if (route.kind !== "bridge") return engine.send(params, listeners);
      let burnTxHash: string | undefined;
      const result = await engine.send(params, {
        ...listeners,
        onBurnSubmitted: (hash) => {
          listeners?.onBurnSubmitted?.(hash);
          if (burnTxHash === hash) return;
          burnTxHash = hash;
          report({
            sourceChain: route.sourceChain,
            burnTxHash: hash,
            clientTransferId: params.quote.id,
          });
        },
      });
      if (burnTxHash && result.kind === "success" && result.finalTxHash) {
        reportMint(
          route.sourceChain,
          burnTxHash,
          params.quote.id,
          result.finalTxHash,
        );
      }
      return result;
    },

    async resume(record, options, listeners) {
      const result = await engine.resume(record, options, listeners);
      if (
        record.sourceTxHash &&
        result.kind === "success" &&
        result.finalTxHash
      ) {
        reportMint(
          record.sourceChain,
          record.sourceTxHash,
          record.id,
          result.finalTxHash,
        );
      }
      return result;
    },

    async resumeFromTx(params, listeners) {
      const result = await engine.resumeFromTx(params, listeners);
      if (result.kind === "success" && result.finalTxHash) {
        reportMint(params.sourceChain, params.txHash, "", result.finalTxHash);
      }
      return result;
    },

    transferFor(sourceChain, burnTxHash) {
      return transfers.get(keyOf(sourceChain, burnTxHash));
    },

    async settled() {
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}
