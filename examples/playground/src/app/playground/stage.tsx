"use client";

import { useCallback, type Dispatch } from "react";
import { WhiskSend, type SendFailure, type SendSuccess } from "@usewhisk/react";
import type { PlaygroundAction, PlaygroundConfig } from "./store";

export function Stage({
  config,
  dispatch,
}: {
  config: PlaygroundConfig;
  dispatch: Dispatch<PlaygroundAction>;
}) {
  const handleSuccess = useCallback(
    (result: SendSuccess) => {
      const tx = result.finalTxHash;
      dispatch({
        type: "LOG_EVENT",
        event: {
          kind: "success",
          label: "Transfer succeeded",
          detail: tx ? `${tx.slice(0, 10)}…${tx.slice(-6)}` : undefined,
        },
      });
    },
    [dispatch],
  );

  const handleFailure = useCallback(
    (result: SendFailure) => {
      const step = result.steps.find((s) => s.state === "error");
      dispatch({
        type: "LOG_EVENT",
        event: {
          kind: "error",
          label: step?.name
            ? `Failed on ${step.name}`
            : (result.error.name ?? "Error"),
          detail: result.error.message,
        },
      });
    },
    [dispatch],
  );

  return (
    <WhiskSend
      tabs={config.tabs}
      onSuccess={handleSuccess}
      onFailure={handleFailure}
    />
  );
}
