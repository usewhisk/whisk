import type { Chain } from "@usewhisk/react";

/**
 * `valid: true` means every required field is present and the chain is one
 * Whisk knows, so the values can go straight into `<WhiskSend>`.
 */
export type InvoiceQuery =
  | {
      valid: true;
      to: string;
      amount: string;
      chain: Chain;
      chainLabel: string;
      memo: string;
    }
  | {
      valid: false;
      reason: "missing-to" | "missing-amount" | "unknown-chain" | "missing";
    };

export type DemoInvoice = {
  label: string;
  memo: string;
  amount: string;
  chain: string;
  to: string;
};
