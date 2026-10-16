import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  // The console app talks to a Postgres DB and issues signed JWTs.
  // Everything runs server-side in Next.js Route Handlers — no edge
  // runtime, so pg + node:crypto both work out of the box.
};

export default config;
