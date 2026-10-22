import { Providers } from "./providers";
import { useBatch } from "./hooks/use-batch";
import { SiteNav, SiteFooter } from "./components/chrome";
import { ReviewStep } from "./components/review-step";
import { PayingStep } from "./components/paying-step";
import { DoneStep } from "./components/done-step";

/**
 * Skipping a payee mid-run also calls `advance`, so a skipped payee counts
 * as done the same way a settled one does.
 */
export function App() {
  const batch = useBatch();

  return (
    <Providers>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-6 sm:px-8 lg:gap-12">
        <SiteNav />

        {batch.step === "review" && (
          <ReviewStep
            included={batch.included}
            excluded={batch.excluded}
            total={batch.summary.total}
            onToggle={batch.toggle}
            onContinue={batch.startBatch}
          />
        )}

        {batch.step === "paying" && batch.currentPayee && (
          <PayingStep
            included={batch.included}
            currentPayee={batch.currentPayee}
            summary={batch.summary}
            onPaid={batch.advance}
            onSkip={batch.advance}
          />
        )}

        {batch.step === "done" && (
          <DoneStep
            included={batch.included}
            total={batch.summary.total}
            onReset={batch.reset}
          />
        )}

        <SiteFooter />
      </div>
    </Providers>
  );
}
