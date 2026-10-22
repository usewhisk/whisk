import { WhiskSend } from "@usewhisk/react";
import { TREASURY_ADDRESS } from "../data/tiers";
import { useDonation } from "../hooks/use-donation";
import { TierSelector } from "./tier-selector";
import { ThankYou } from "./thank-you";

export function DonateCard() {
  const donation = useDonation();

  return (
    <article className="rounded-2xl border border-line bg-paper p-6 shadow-[0_1px_2px_rgba(15,42,29,0.04),0_18px_40px_-22px_rgba(15,42,29,0.16)] sm:p-8">
      <DonateHeader />

      <TierSelector
        selection={donation.selection}
        onPickTier={donation.pickTier}
        onPickCustom={donation.pickCustom}
      />

      <div className="my-6 h-px bg-line" />

      {donation.confirmed ? (
        <ThankYou confirmed={donation.confirmed} onAgain={donation.reset} />
      ) : (
        <WidgetSurface
          widgetAmount={donation.widgetAmount}
          onPaid={donation.confirm}
        />
      )}
    </article>
  );
}

function DonateHeader() {
  return (
    <header className="flex flex-col gap-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-fern">
        Plant a tree · forever on-chain
      </p>
      <h2 className="m-0 font-display text-3xl leading-[1.1] tracking-tight text-canopy sm:text-[2.1rem]">
        Pick a tier. We'll plant — and tag the GPS.
      </h2>
      <p className="m-0 max-w-xl text-[15px] leading-relaxed text-ink-soft">
        Funds go straight to the partner who plants in your name. Phantom,
        MetaMask, Coinbase — we receive USDC from any chain. We publish every
        wallet, every transaction, every tree.
      </p>
    </header>
  );
}

function WidgetSurface({
  widgetAmount,
  onPaid,
}: {
  /** Controlled amount when a tier is picked; undefined in custom mode. */
  widgetAmount: string | undefined;
  onPaid: (paid: { amount?: string; txHash?: string }) => void;
}) {
  return (
    <div
      className="rounded-xl bg-cream/40 p-3"
      style={{ animation: "of-fade-in 240ms ease-out" }}
    >
      <div className="flex justify-center">
        <WhiskSend
          recipient={TREASURY_ADDRESS}
          destinationChain="Optimism_Sepolia"
          amount={widgetAmount}
          onSuccess={({ finalTxHash }) =>
            onPaid({ amount: widgetAmount, txHash: finalTxHash })
          }
        />
      </div>
      <p className="m-0 mt-2 text-center text-[11px] uppercase tracking-[0.15em] text-ink-muted">
        {widgetAmount
          ? `Tier locked — $${widgetAmount} · fees covered, OpenForest receives the full amount`
          : "Custom amount · fees covered, OpenForest receives the full amount"}
      </p>
    </div>
  );
}
