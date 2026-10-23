"use client";

import { useMemo } from "react";
import type { StellarAdapter } from "@usewhisk/core";
import { useStellarWallet } from "../provider/stellarContext.js";
import { createStellarAdapter } from "./stellarAdapter.js";

/**
 * The connected Stellar wallet as a `StellarAdapter`, or `null` when none is
 * connected or `config.wallets` has no `stellar()` factory.
 */
export function useStellarAdapter(): StellarAdapter | null {
  const stellar = useStellarWallet();

  return useMemo<StellarAdapter | null>(() => {
    if (!stellar || !stellar.address) return null;
    return createStellarAdapter(stellar.kit, stellar.address, stellar.config);
  }, [stellar]);
}
