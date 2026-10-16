"use client";

import { useCallback, type Dispatch } from "react";
import { WhiskSend, type SendFailure, type SendSuccess } from "@usewhisk/react";
import type { PlaygroundAction, PlaygroundConfig } from "./store";

/**
 * The actual `<WhiskSend>` driven by the current playground config.
 *
 * `useCallback` on the lifecycle handlers holds their identity stable
 * across renders — `dispatch` from `useReducer` is guaranteed stable,
 * so the widget's internal `useEffect` deps don't churn.
 */
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
