/**
 * Server-side session helpers.
 *
 * `getSessionUser()` — returns the signed-in user or `null`.
 * `requireUser()` — same, but redirects to `/sign-in` when absent.
 *   Use in server components at the top of every gated page.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth.js";
import type { UserRow } from "@/db/schema";

export async function getSessionUser(): Promise<UserRow | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return (session?.user as UserRow) ?? null;
}

export async function requireUser(): Promise<UserRow> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}
