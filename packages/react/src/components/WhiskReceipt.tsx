"use client";

import type { ReactNode } from "react";
import {
  chainInfo,
  RECEIPT_STAGE_HELP,
  RECEIPT_STAGE_LABELS,
  type Chain,
} from "@usewhisk/core";
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
  /** Force the failed stage — pass when the engine already returned a `SendFailure`. */
  hasError?: boolean;
  /** Optional title shown in the header. */
  title?: string;
  /** Optional description shown under the title. */
  description?: ReactNode;
  /** Override the Iris poll cadence (ms). Default 3000. */
  pollIntervalMs?: number;
  /** Stop polling after this many ms. Default 10 minutes. */
  pollTimeoutMs?: number;
};

/**
 * Drop-in settlement-status widget. Given a source-chain tx hash and
 * the destination chain, it polls Iris and renders the lifecycle as a
 * stepper plus a status banner.
 *
 * Same-chain transfers settle immediately (the source tx IS the
 * settlement). Cross-chain transfers walk through burn → attestation
 * → mint as Iris reports progress.
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
            {chainInfo(sourceChain).label}
            {view?.isCrossChain
              ? ` → ${chainInfo(destinationChain).label}`
              : ""}
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
