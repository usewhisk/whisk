"use client";

import { usePayout } from "../hooks/use-payout";
import { Sidebar } from "../components/sidebar";
import { TopBar, Hero } from "../components/top-bar";
import { StatsGrid } from "../components/stats-grid";
import { VendorTable } from "../components/vendor-table";
import { QuickSend } from "../components/quick-send";
import { RecentSettlements } from "../components/recent-settlements";
import { ActivityLog, DashboardFooter } from "../components/activity-log";

export function Dashboard() {
  const payout = usePayout();

  return (
    <div className="mx-auto grid min-h-dvh max-w-[1280px] grid-cols-1 gap-0 lg:grid-cols-[220px_1fr]">
      <Sidebar />

      <main className="flex flex-col gap-7 border-l border-line/0 px-5 py-6 lg:border-line lg:px-8">
        <TopBar />
        <Hero />

        <StatsGrid />

        <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <VendorTable onSelect={payout.select} />
          <QuickSend
            state={payout.state}
            onPaid={payout.confirm}
            onClear={payout.reset}
            onReset={payout.reset}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <RecentSettlements />
          <ActivityLog />
        </section>

        <DashboardFooter />
      </main>
    </div>
  );
}
