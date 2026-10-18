"use client";

import dynamic from "next/dynamic";

/**
 * Client-side gate that lazy-loads the playground with `ssr: false`.
 *
 * Why this exists: Next.js disallows `ssr: false` inside server
 * components. So `page.tsx` (server) renders this gate, which is a
 * client component, which dynamically imports the playground tree.
 * The wagmi + IndexedDB-touching code never runs on the server.
 */
const Playground = dynamic(
  () => import("./playground").then((m) => ({ default: m.Playground })),
  { ssr: false },
);

export function ClientGate() {
  return <Playground />;
}
