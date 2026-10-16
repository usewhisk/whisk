import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { listProjects, requireOrgMembership } from "@/lib/orgs";
import { TIER_BPS } from "@/db/schema";
import { createProjectAction } from "../actions";

export default async function OrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const user = await requireUser();
  const { orgId } = await params;
  const org = await requireOrgMembership(orgId, user.id).catch(() => null);
  if (!org) notFound();
  const projects = await listProjects(orgId);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{org.name}</h1>
          <p className="page-subtitle">
            Tier: <span className="pill">{org.tier}</span>{" "}
            <span className="muted" style={{ marginLeft: 8 }}>
              Protocol fee: {TIER_BPS[org.tier]} bps
            </span>
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 480px" }}>
          <h2 style={{ fontSize: 15, marginTop: 0, marginBottom: 12 }}>
            Projects
          </h2>
          {projects.length === 0 ? (
            <div className="card muted">
              No projects yet. Create one on the right to get started.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/${orgId}/${p.id}`}
                  className="card"
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {p.id}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ flex: "1 1 320px", alignSelf: "start" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>New project</div>
          <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
            One per product. Each project holds multiple apps (test + live).
          </p>
          <form
            action={createProjectAction}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <input type="hidden" name="orgId" value={orgId} />
            <input
              type="text"
              name="name"
              required
              placeholder="Checkout"
              className="input"
            />
            <button type="submit" className="btn btn-primary">
              Create project
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
