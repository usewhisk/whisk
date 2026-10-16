"use client";

import { useContext } from "react";
import { ConfigError } from "@usewhisk/core";
import { WhiskContext, type WhiskContextValue } from "../provider/context.js";

/**
 * Read the live Whisk context. Throws a {@link ConfigError} if called
 * outside `<WhiskProvider>` — the error message points at the missing
 * provider so the developer can fix it immediately.
 */
export function useWhiskContext(): WhiskContextValue {
  const ctx = useContext(WhiskContext);
  if (!ctx) {
    throw new ConfigError(
      "useWhiskContext: not mounted inside <WhiskProvider>. Wrap your app (or just the widget tree) in <WhiskProvider config={...}>.",
    );
  }
  return ctx;
}
