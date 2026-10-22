import { Providers } from "./providers";
import { SiteNav, SiteFooter } from "./components/chrome";
import { Hero } from "./components/hero";
import { StatsRow } from "./components/stats-row";
import { DonateCard } from "./components/donate-card";
import { DonorWall } from "./components/donor-wall";
import { Projects } from "./components/projects";

export function App() {
  return (
    <Providers>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 py-5 sm:px-8 lg:gap-16">
        <SiteNav />
        <Hero />
        <StatsRow />
        <section
          id="donate"
          className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10"
        >
          <DonateCard />
          <DonorWall />
        </section>
        <Projects />
        <SiteFooter />
      </div>
    </Providers>
  );
}
