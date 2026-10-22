"use client";

import { useContext } from "react";
import { ConfigError } from "@usewhisk/core";
import { WhiskContext, type WhiskContextValue } from "../provider/context.js";

/** Throws a {@link ConfigError} when called outside `<WhiskProvider>`. */
export function useWhiskContext(): WhiskContextValue {
  const ctx = useContext(WhiskContext);
  if (!ctx) {
    throw new ConfigError(
      "useWhiskContext: not mounted inside <WhiskProvider>. Wrap your app (or just the widget tree) in <WhiskProvider config={...}>.",
    );
  }
  return ctx;
}
