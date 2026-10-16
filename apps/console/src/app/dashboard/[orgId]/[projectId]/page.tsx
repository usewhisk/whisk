import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getProject, listApps, requireOrgMembership } from "@/lib/orgs";
import { createAppAction } from "../../actions";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const user = await requireUser();
  const { orgId, projectId } = await params;
  await requireOrgMembership(orgId, user.id).catch(() => notFound());
  const project = await getProject(projectId);
  if (!project || project.orgId !== orgId) notFound();
  const apps = await listApps(projectId);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            <Link href={`/dashboard/${orgId}`}>← Organization</Link>
          </p>
          <h1 className="page-title" style={{ marginTop: 4 }}>
            {project.name}
          </h1>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 480px" }}>
          <h2 style={{ fontSize: 15, marginTop: 0, marginBottom: 12 }}>Apps</h2>
          {apps.length === 0 ? (
            <div className="card muted">
              Create your first app to get an app key. Most projects have two:
              one <code>test</code>, one <code>live</code>.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {apps.map((a) => (
                <Link
                  key={a.id}
                  href={`/dashboard/${orgId}/${projectId}/${a.id}`}
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
                  <div>
                    <div style={{ fontWeight: 500 }}>{a.name}</div>
                    <div
                      className="muted"
                      style={{ fontSize: 12, marginTop: 2 }}
                    >
                      {a.id}
                    </div>
                  </div>
                  <span className="pill">{a.environment}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ flex: "1 1 320px", alignSelf: "start" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>New app</div>
          <form
            action={createAppAction}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="projectId" value={projectId} />
            <div>
              <label className="label" htmlFor="app-name">
                Name
              </label>
              <input
                id="app-name"
                type="text"
                name="name"
                required
                placeholder="Checkout (test)"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="app-env">
                Environment
              </label>
              <select
                id="app-env"
                name="environment"
                className="input"
                defaultValue="test"
              >
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary">
              Create app
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
