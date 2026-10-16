import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  getApp,
  getMonthlyUsage,
  getProject,
  listKeys,
  requireOrgMembership,
} from "@/lib/orgs";
import { TIER_BPS, type Tier } from "@/db/schema";

export default async function AppPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; projectId: string; appId: string }>;
  searchParams: Promise<{ reveal?: string }>;
}) {
  const user = await requireUser();
  const { orgId, projectId, appId } = await params;
  const { reveal } = await searchParams;
  const org = await requireOrgMembership(orgId, user.id).catch(() => null);
  if (!org) notFound();
  const project = await getProject(projectId);
  const app = await getApp(appId);
  if (!project || project.orgId !== orgId) notFound();
  if (!app || app.projectId !== projectId) notFound();

  const keys = await listKeys(appId);
  const publicKey = keys.find((k) => k.kind === "public");
  const secretKey = keys.find((k) => k.kind === "secret");
  const usage = await getMonthlyUsage(appId);
  const bps = TIER_BPS[org.tier as Tier];

  return (
    <>
      <div className="page-header">
        <div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            <Link href={`/dashboard/${orgId}/${projectId}`}>
              ← {project.name}
            </Link>
          </p>
          <h1 className="page-title" style={{ marginTop: 4 }}>
            {app.name}{" "}
            <span className="pill" style={{ verticalAlign: "middle" }}>
              {app.environment}
            </span>
          </h1>
        </div>
      </div>

      {reveal ? (
        <div
          className="card"
          style={{
            marginBottom: 24,
            borderColor: "var(--primary)",
            background: "rgba(176, 79, 62, 0.05)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Your secret key
          </div>
          <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
            This is the only time this key is shown. Copy it into a secure place
            — you can rotate it any time, but you cannot view it again.
          </p>
          <pre style={{ margin: 0 }}>{reveal}</pre>
        </div>
      ) : null}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>API keys</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {publicKey ? (
            <div className="card" style={{ padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>Public key</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Embed in the browser. Domain allowlist applies.
                  </div>
                </div>
                <span className="pill">public</span>
              </div>
              <pre style={{ marginTop: 12, marginBottom: 0 }}>
                {publicKey.plaintext}
              </pre>
            </div>
          ) : null}
          {secretKey ? (
            <div className="card" style={{ padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>Secret key</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Server-only. Shown once on creation.
                  </div>
                </div>
                <span className="pill">secret</span>
              </div>
              <pre style={{ marginTop: 12, marginBottom: 0 }}>
                {secretKey.displayPrefix}…
              </pre>
            </div>
          ) : null}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>This month</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>
              Transactions
            </div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {usage.transactions.toLocaleString()}
            </div>
          </div>
          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>
              Volume (USDC)
            </div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {Number(usage.volumeUsdc).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>
              Fee tier
            </div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{bps} bps</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Displayed in the widget · not yet collected
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Install</h2>
        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 8 }}>
            Drop this into your React app
          </div>
          <pre style={{ marginTop: 0 }}>
            {`import { createWhiskConfig, evm } from "@usewhisk/react";

const config = createWhiskConfig({
  appId: "${publicKey?.plaintext ?? "wsk_pk_..."}",
  wallets: [evm({ projectId: process.env.NEXT_PUBLIC_WC! })],
  chains: ["Base_Sepolia", "Ethereum_Sepolia"],
});`}
          </pre>
        </div>
      </section>
    </>
  );
}
