"use client";

import { useContext, useState, type ReactNode } from "react";
import {
  getChain,
  RECEIPT_STAGE_HELP,
  RECEIPT_STAGE_LABELS,
  toWhiskError,
  type Chain,
} from "@usewhisk/core";
import { Button } from "./ui/Button.js";
import { WhiskContext } from "../provider/context.js";
import { useAdapterFor } from "../hooks/useAdapterFor.js";
import { Card } from "./ui/Card.js";
import { StepRail } from "./ui/StepRail.js";
import { Banner } from "./ui/Banner.js";
import { PoweredByWhisk } from "./ui/PoweredByWhisk.js";
import { useReceipt } from "../hooks/useReceipt.js";

export type WhiskReceiptProps = {
  sourceChain: Chain;
  sourceTxHash: string | undefined;
  destinationChain: Chain;
  destinationTxHash?: string;
  /** Force the failed stage, such as when the engine already returned a `SendFailure`. */
  hasError?: boolean;
  /** Header title. Defaults to `"Transfer status"`. */
  title?: string;
  /** Shown under the title. */
  description?: ReactNode;
  /** Iris poll interval in ms. Default 3000. */
  pollIntervalMs?: number;
  /** Stop polling after this many ms. Default 10 minutes. */
  pollTimeoutMs?: number;
};

/**
 * Settlement status for a transfer, polled from Iris. A same-chain transfer
 * is settled as soon as its source tx exists. Inside a `WhiskProvider`, a
 * cross-chain transfer that has not settled gets a button to finish it.
 */
export function WhiskReceipt({
  sourceChain,
  sourceTxHash,
  destinationChain,
  destinationTxHash,
  hasError,
  title = "Transfer status",
  description,
  pollIntervalMs,
  pollTimeoutMs,
}: WhiskReceiptProps) {
  // Outside a WhiskProvider the receipt still shows status, without the
  // button that finishes the transfer.
  const engine = useContext(WhiskContext)?.engine;
  const adapterFor = useAdapterFor();
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<string | null>(null);

  async function finish(txHash: string) {
    if (!engine) return;
    setFinishing(true);
    setFinishError(null);
    const destinationAdapter = adapterFor(destinationChain);
    try {
      const result = await engine.resumeFromTx({
        sourceChain,
        txHash,
        ...(destinationAdapter && { destinationAdapter }),
      });
      if (result.kind === "success") setDelivered(result.finalTxHash ?? "");
      else setFinishError(result.error.message);
    } catch (err) {
      setFinishError(
        toWhiskError(err, "The transfer could not be finished.").message,
      );
    } finally {
      setFinishing(false);
    }
  }

  const { view, isLoading, error } = useReceipt({
    sourceChain,
    sourceTxHash,
    destinationChain,
    ...(destinationTxHash && { destinationTxHash }),
    ...(hasError && { hasError: true }),
    ...(pollIntervalMs !== undefined && { pollIntervalMs }),
    ...(pollTimeoutMs !== undefined && { pollTimeoutMs }),
  });

  if (!sourceTxHash) {
    return (
      <Card className="whisk-receipt">
        <header className="whisk-header">
          <div>
            <h2 className="whisk-header__mark">{title}</h2>
            <p className="whisk-header__tag">
              Provide a source transaction hash to see the receipt.
            </p>
          </div>
        </header>
        <PoweredByWhisk />
      </Card>
    );
  }

  return (
    <Card className="whisk-receipt">
      <header className="whisk-header">
        <div>
          <h2 className="whisk-header__mark">{title}</h2>
          <p className="whisk-header__tag">
            {getChain(sourceChain).label}
            {view?.isCrossChain ? ` → ${getChain(destinationChain).label}` : ""}
          </p>
          {description ? (
            <p className="whisk-header__tag">{description}</p>
          ) : null}
        </div>
      </header>

      {view ? (
        <Banner
          variant={
            view.stage === "failed"
              ? "error"
              : view.stage === "settled"
                ? "info"
                : "warning"
          }
        >
          <strong>{RECEIPT_STAGE_LABELS[view.stage]}.</strong>{" "}
          {RECEIPT_STAGE_HELP[view.stage]}
        </Banner>
      ) : null}

      {error ? (
        <Banner variant="error">
          <strong>Iris polling failed.</strong> {error.message}
        </Banner>
      ) : null}

      {view ? <StepRail steps={view.steps} /> : null}
      {delivered !== null ? (
        <Banner variant="info">
          <strong>Delivered.</strong> The recipient has the USDC.
        </Banner>
      ) : engine && view?.isCrossChain && view.stage !== "settled" ? (
        <Button
          variant="outline"
          disabled={finishing}
          onClick={() => void finish(sourceTxHash)}
        >
          {finishing ? "Finishing…" : "Finish transfer"}
        </Button>
      ) : null}
      {finishError ? (
        <Banner variant="error" role="alert">
          {finishError}
        </Banner>
      ) : null}

      {isLoading ? (
        <p className="whisk-help">Checking attestation status…</p>
      ) : null}

      {view ? (
        <div className="whisk-summary">
          <div className="whisk-summary__row">
            <span className="whisk-summary__label">Source tx</span>
            <a
              className="whisk-summary__value"
              href={view.sourceExplorerUrl}
              target="_blank"
              rel="noreferrer noopener"
              style={{ fontFamily: "var(--whisk-font-mono)" }}
            >
              {shortenHash(sourceTxHash)}
            </a>
          </div>
          {view.destinationExplorerUrl && destinationTxHash ? (
            <div className="whisk-summary__row">
              <span className="whisk-summary__label">Destination tx</span>
              <a
                className="whisk-summary__value"
                href={view.destinationExplorerUrl}
                target="_blank"
                rel="noreferrer noopener"
                style={{ fontFamily: "var(--whisk-font-mono)" }}
              >
                {shortenHash(destinationTxHash)}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      <PoweredByWhisk />
    </Card>
  );
}

function shortenHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}
