"use client";

import { useReducer } from "react";
import type { FeeBearer } from "@usewhisk/react";

export type Theme = "auto" | "light" | "dark";

export type EventKind = "state" | "success" | "error" | "info";

export type PlaygroundConfig = {
  theme: Theme;

  /* The engine reads this once, so changing it remounts the provider. */
  feeBearer: FeeBearer;

  tabs: ReadonlyArray<"send" | "bridge">;
};

export type PlaygroundEvent = {
  id: string;
  at: number;
  kind: EventKind;
  label: string;
  detail?: string;
};

export type PlaygroundState = {
  config: PlaygroundConfig;
  events: PlaygroundEvent[];
};

export type PlaygroundAction =
  | { type: "SET_CONFIG"; patch: Partial<PlaygroundConfig> }
  | { type: "LOG_EVENT"; event: Omit<PlaygroundEvent, "id" | "at"> }
  | { type: "CLEAR_LOG" };

export const INITIAL_CONFIG: PlaygroundConfig = {
  theme: "auto",
  feeBearer: "sender",
  tabs: ["send", "bridge"],
};

const INITIAL_STATE: PlaygroundState = {
  config: INITIAL_CONFIG,
  events: [],
};

const MAX_EVENTS = 30;

function reducer(
  state: PlaygroundState,
  action: PlaygroundAction,
): PlaygroundState {
  switch (action.type) {
    case "SET_CONFIG":
      return { ...state, config: { ...state.config, ...action.patch } };

    case "LOG_EVENT": {
      const event: PlaygroundEvent = {
        ...action.event,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: Date.now(),
      };
      return {
        ...state,
        events: [event, ...state.events].slice(0, MAX_EVENTS),
      };
    }

    case "CLEAR_LOG":
      return { ...state, events: [] };
  }
}

export function usePlaygroundStore() {
  return useReducer(reducer, INITIAL_STATE);
}
