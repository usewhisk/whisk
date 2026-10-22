import { useCallback, useState } from "react";
import type { Tier } from "../data/tiers";
import { TIERS } from "../data/tiers";

export type DonationSelection =
  | { kind: "tier"; tier: Tier }
  | { kind: "custom" };

export type ConfirmedDonation = {
  amount?: string;
  txHash?: string;
  /** Null for a custom amount, which maps to no fixed tree count. */
  trees: number | null;
};

/**
 * A tier passes `amount` to the widget, which locks the field. Custom mode
 * passes nothing so the donor can type any amount.
 */
export function useDonation() {
  const [selection, setSelection] = useState<DonationSelection>({
    kind: "tier",
    tier: TIERS[1]!,
  });
  const [confirmed, setConfirmed] = useState<ConfirmedDonation | null>(null);

  const pickTier = useCallback((tier: Tier) => {
    setSelection({ kind: "tier", tier });
  }, []);

  const pickCustom = useCallback(() => {
    setSelection({ kind: "custom" });
  }, []);

  const confirm = useCallback(
    (paid: { amount?: string; txHash?: string }) => {
      setConfirmed({
        amount: paid.amount,
        txHash: paid.txHash,
        trees: selection.kind === "tier" ? selection.tier.trees : null,
      });
    },
    [selection],
  );

  const reset = useCallback(() => setConfirmed(null), []);

  const widgetAmount =
    selection.kind === "tier" ? selection.tier.amount : undefined;

  return {
    selection,
    confirmed,
    widgetAmount,
    pickTier,
    pickCustom,
    confirm,
    reset,
  };
}
