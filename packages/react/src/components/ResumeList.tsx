"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { getChain, toWhiskError, type InflightRecord } from "@usewhisk/core";
import { Button } from "./ui/Button.js";
import { useWhiskEngine } from "../hooks/useWhiskEngine.js";
import { useAdapterFor } from "../hooks/useAdapterFor.js";

type RowState = { busy?: boolean; error?: string; delivered?: boolean };

/**
 * Transfers the engine kept between burn and mint, such as one whose tab was
 * closed, each with a way to finish it or put it away.
 */
export function ResumeList() {
  const engine = useWhiskEngine();
  const adapterFor = useAdapterFor();
  const [records, setRecords] = useState<InflightRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let cancelled = false;
    engine.inflight().then(
      (found) => {
        if (!cancelled) setRecords([...found]);
      },
      (err: unknown) => {
        if (!cancelled) {
          setLoadError(
            toWhiskError(err, "Could not read transfers in progress.").message,
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [engine]);

  const update = (id: string, state: RowState) =>
    setRows((prev) => ({ ...prev, [id]: state }));

  async function resume(record: InflightRecord) {
    update(record.id, { busy: true });
    const destinationAdapter = adapterFor(record.destinationChain);
    try {
      const result = await engine.resume(
        record,
        destinationAdapter ? { destinationAdapter } : {},
      );
      update(
        record.id,
        result.kind === "success"
          ? { delivered: true }
          : { error: result.error.message },
      );
    } catch (err) {
      update(record.id, {
        error: toWhiskError(err, "The transfer could not be resumed.").message,
      });
    }
  }

  async function dismiss(record: InflightRecord) {
    try {
      await engine.dismiss(record.id);
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
    } catch (err) {
      update(record.id, {
        error: toWhiskError(err, "The transfer could not be dismissed.")
          .message,
      });
    }
  }

  if (loadError) {
    return (
      <div className="whisk-banner whisk-banner--error" role="alert">
        {loadError}
      </div>
    );
  }
  if (records.length === 0) return null;

  return (
    <div className="whisk-resume">
      {records.map((record) => {
        const row = rows[record.id] ?? {};
        const source = getChain(record.sourceChain);
        const delivered = row.delivered || record.step === "minted";
        return (
          <div
            key={record.id}
            role="group"
            aria-label="Transfer in progress"
            className={`whisk-banner ${delivered ? "whisk-banner--info" : "whisk-banner--warning"}`}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>
                {formatUnits(BigInt(record.amountBurned), source.usdcDecimals)}{" "}
                USDC
              </strong>{" "}
              {source.label} → {getChain(record.destinationChain).label}
              <div className="whisk-help">
                {delivered ? "Delivered." : STEP_LABEL[record.step]}
              </div>
              {row.error ? (
                <div className="whisk-help whisk-help--error" role="alert">
                  {row.error}
                </div>
              ) : null}
            </div>
            {delivered ? null : (
              <Button
                variant="outline"
                disabled={row.busy}
                onClick={() => void resume(record)}
              >
                {row.busy ? "Resuming…" : "Resume"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => void dismiss(record)}>
              Dismiss
            </Button>
          </div>
        );
      })}
    </div>
  );
}

const STEP_LABEL: Record<InflightRecord["step"], string> = {
  signing: "Waiting for the wallet. If it sent the burn, resume from its hash.",
  burned: "Burned. Waiting for Circle to attest.",
  attested: "Attested. Ready to mint.",
  minted: "Delivered.",
};
