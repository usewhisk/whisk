import Link from "next/link";
import { Logo } from "./logo";

const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Examples", href: "/#examples" },
      { label: "Playground", href: "https://whisk-playground.vercel.app" },
    ],
  },
  {
    title: "Packages",
    links: [
      {
        label: "@usewhisk/react",
        href: "https://www.npmjs.com/package/@usewhisk/react",
      },
      {
        label: "@usewhisk/core",
        href: "https://www.npmjs.com/package/@usewhisk/core",
      },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Telegram", href: "https://t.me/usewhisk" },
      { label: "X (formerly Twitter)", href: "https://x.com/usewhisk" },
      { label: "GitHub", href: "https://github.com/Signor1/whisk" },
    ],
  },
];

/**
 * Site-wide footer. Three link columns + brand block. Surfaces on the
 * marketing route group; fumadocs renders its own page footer inside
 * `/docs/*`.
 */
export function Footer() {
  return (
    <footer className="mt-auto w-full border-t border-border/60 bg-background">
      <div className="mx-auto flex max-w-[90rem] flex-col gap-10 px-4 py-12 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-8 md:px-6">
        <div className="sm:max-w-xs">
          <Logo />
          <p className="mt-3 text-sm text-foreground/75 md:text-base">
            Drop-in USDC send & bridge widget for React. Built on Circle App
            Kit.
          </p>
        </div>

        {FOOTER_GROUPS.map((group) => (
          <div key={group.title} className="min-w-32">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              {group.title}
            </h3>
            <ul className="mt-3 space-y-2">
              {group.links.map((link) => {
                const external = link.href.startsWith("http");
                return (
                  <li key={link.label}>
                    {external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-foreground/75 transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-foreground/75 transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-[90rem] flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-foreground/75 sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} Whisk. MIT licensed.</span>
          <span>
            Made with{" "}
            <a
              href="https://developers.circle.com/cctp"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Circle CCTP
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
