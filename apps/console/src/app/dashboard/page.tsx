import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listOrgsForUser } from "@/lib/orgs";
import { createOrgAction } from "./actions";

export const metadata = { title: "Home" };

export default async function DashboardHome() {
  const user = await requireUser();
  const orgs = await listOrgsForUser(user.id);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Your organizations</h1>
          <p className="page-subtitle">
            Every project and app lives inside an organization.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {orgs.map((o) => (
          <Link
            key={o.id}
            href={`/dashboard/${o.id}`}
            className="card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "start",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{o.name}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {o.slug}
                </div>
              </div>
              <span className="pill">{o.tier}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          Create a new organization
        </div>
        <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
          Useful when a client or team should be billed separately.
        </p>
        <form action={createOrgAction} style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            name="name"
            required
            placeholder="Acme, Inc."
            className="input"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary">
            Create
          </button>
        </form>
      </div>
    </>
  );
}
