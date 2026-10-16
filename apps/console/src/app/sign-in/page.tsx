import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <main
      style={{
        maxWidth: 400,
        margin: "80px auto",
        padding: "0 24px",
      }}
    >
      <div
        className="card"
        style={{ display: "flex", flexDirection: "column", gap: 20 }}
      >
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Sign in to Whisk</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Manage projects, keys, and usage.
          </p>
        </div>
        <SignInForm />
      </div>
    </main>
  );
}
