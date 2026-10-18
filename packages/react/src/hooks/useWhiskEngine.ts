"use client";

import type { WhiskEngine } from "@usewhisk/core";
import { useWhiskContext } from "./useWhiskContext.js";

/** Return the engine constructed by the surrounding `<WhiskProvider>`. */
export function useWhiskEngine(): WhiskEngine {
  return useWhiskContext().engine;
}
