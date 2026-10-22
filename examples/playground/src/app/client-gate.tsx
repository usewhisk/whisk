"use client";

import dynamic from "next/dynamic";

/**
 * Next.js only allows `ssr: false` in a client component, so the server
 * page renders this gate. wagmi and the IndexedDB code then never run on
 * the server.
 */
const Playground = dynamic(
  () => import("./playground").then((m) => ({ default: m.Playground })),
  { ssr: false },
);

export function ClientGate() {
  return <Playground />;
}
