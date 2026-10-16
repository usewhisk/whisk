import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <main
      style={{
        maxWidth: 640,
        margin: "80px auto",
        padding: "0 24px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--primary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Whisk Console
        </div>
        <h1 style={{ fontSize: 32, marginTop: 8, marginBottom: 12 }}>
          Ship USDC payments across every CCTP V2 chain.
        </h1>
        <p className="muted" style={{ fontSize: 16, marginTop: 0 }}>
          Create a project, grab an app key, drop the widget in. Free tier ships
          mainnet from day one — no card required.
        </p>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/sign-in" className="btn btn-primary">
          Sign in with GitHub
        </Link>
        <a
          href="https://www.usewhisk.xyz/docs"
          className="btn btn-secondary"
          target="_blank"
          rel="noreferrer"
        >
          Read the docs
        </a>
      </div>
    </main>
  );
}
