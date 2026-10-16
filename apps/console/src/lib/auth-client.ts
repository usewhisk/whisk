/**
 * Browser-side Better Auth client. Only used by client components
 * (sign-in form, sign-out button) — the server uses `auth.api.*`
 * directly.
 */
"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3020"),
});

export const { signIn, signOut, useSession } = authClient;
