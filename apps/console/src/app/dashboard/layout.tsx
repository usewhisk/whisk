import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ensureDefaultOrg, listOrgsForUser } from "@/lib/orgs";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  await ensureDefaultOrg(user);
  const orgs = await listOrgsForUser(user.id);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar__brand">Whisk</div>
        <Link href="/dashboard" className="sidebar__link">
          Home
        </Link>
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              padding: "0 12px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--fg-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            Organizations
          </div>
          {orgs.map((o) => (
            <Link
              key={o.id}
              href={`/dashboard/${o.id}`}
              className="sidebar__link"
            >
              {o.name}
            </Link>
          ))}
        </div>
        <div style={{ marginTop: "auto", paddingTop: 16 }}>
          <div
            style={{
              padding: "8px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
              Signed in as
            </span>
            <span style={{ fontWeight: 500 }}>{user.email}</span>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
