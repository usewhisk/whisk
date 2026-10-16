/**
 * Better Auth's own routes — sign in / sign out / callback / session.
 * Everything else in the console lives outside `/api/auth`.
 */
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
