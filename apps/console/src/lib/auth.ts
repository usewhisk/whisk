/**
 * Better Auth instance for the Whisk Console.
 *
 * GitHub OAuth is the primary sign-in path — every dev already has a
 * GitHub account and it doubles as identity verification. Email +
 * password stays available as a fallback (mostly for support-account
 * scenarios).
 *
 * The Drizzle adapter maps Better Auth's core tables (user / session
 * / account / verification) onto the schema in `db/schema.ts`. The
 * `.env` file must supply `BETTER_AUTH_SECRET` (32-byte random) and
 * `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "@/db/client";

const GITHUB_CLIENT_ID = process.env["GITHUB_CLIENT_ID"];
const GITHUB_CLIENT_SECRET = process.env["GITHUB_CLIENT_SECRET"];

if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
  console.warn(
    "[auth] GitHub OAuth credentials missing — sign-in via GitHub will fail. Set GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET in .env.local.",
  );
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  secret: process.env["BETTER_AUTH_SECRET"],
  baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3020",
  socialProviders: {
    ...(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: GITHUB_CLIENT_ID,
            clientSecret: GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
  },
  emailAndPassword: {
    enabled: true,
    // Autoverify in test envs; require verification link in prod.
    requireEmailVerification: process.env["NODE_ENV"] === "production",
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once per 24h
  },
});

export type Auth = typeof auth;
