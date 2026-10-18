"use client";

import { PlaygroundProviders } from "./providers";
import { Controls } from "./controls";
import { Stage } from "./stage";
import { EventLog } from "./event-log";
import { usePlaygroundStore } from "./store";

export function Playground() {
  const [state, dispatch] = usePlaygroundStore();

  return (
    <PlaygroundProviders
      theme={state.config.theme}
      feeBearer={state.config.feeBearer}
    >
      <div className="pg-layout">
        <Controls config={state.config} dispatch={dispatch} />
        <main className="pg-stage" aria-label="Widget stage">
          <Stage config={state.config} dispatch={dispatch} />
        </main>
        <EventLog events={state.events} dispatch={dispatch} />
      </div>
    </PlaygroundProviders>
  );
}
