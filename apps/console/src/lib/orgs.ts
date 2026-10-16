/**
 * Organization / project / app / key data access + server actions.
 *
 * All functions in here assume they run server-side (Route Handler or
 * Server Component). Callers must have already resolved the acting
 * user via `requireUser()` — the DB layer trusts its input.
 *
 * Authorization is enforced at the query level: every fetch is scoped
 * to orgs the user is a member of. There is no "admin bypass" surface.
 */
import { and, eq, sql as raw } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { newId, newKey } from "./ids.js";
import { createHash } from "node:crypto";

export type OrgWithRole = schema.OrganizationRow & { role: string };

/** List orgs the user belongs to, with their role. */
export async function listOrgsForUser(userId: string): Promise<OrgWithRole[]> {
  const rows = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      ownerUserId: schema.organization.ownerUserId,
      tier: schema.organization.tier,
      createdAt: schema.organization.createdAt,
      updatedAt: schema.organization.updatedAt,
      role: schema.orgMember.role,
    })
    .from(schema.organization)
    .innerJoin(
      schema.orgMember,
      eq(schema.orgMember.orgId, schema.organization.id),
    )
    .where(eq(schema.orgMember.userId, userId));
  return rows as OrgWithRole[];
}

/** Assert membership. Returns the org row or throws. */
export async function requireOrgMembership(
  orgId: string,
  userId: string,
): Promise<schema.OrganizationRow> {
  const row = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      ownerUserId: schema.organization.ownerUserId,
      tier: schema.organization.tier,
      createdAt: schema.organization.createdAt,
      updatedAt: schema.organization.updatedAt,
    })
    .from(schema.organization)
    .innerJoin(
      schema.orgMember,
      eq(schema.orgMember.orgId, schema.organization.id),
    )
    .where(
      and(
        eq(schema.organization.id, orgId),
        eq(schema.orgMember.userId, userId),
      ),
    )
    .limit(1);
  const org = row[0];
  if (!org) throw new Error("Not authorized for this organization.");
  return org;
}

/** Create a fresh org and add the creator as owner in one transaction. */
export async function createOrg(input: {
  ownerUserId: string;
  name: string;
  slug: string;
}): Promise<schema.OrganizationRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.organization)
      .values({
        id: newId("org"),
        ownerUserId: input.ownerUserId,
        name: input.name,
        slug: input.slug,
        tier: "free",
      })
      .returning();
    if (!row) throw new Error("Failed to create organization.");
    await tx.insert(schema.orgMember).values({
      orgId: row.id,
      userId: input.ownerUserId,
      role: "owner",
    });
    return row;
  });
}

/** Ensure every user has at least one personal org they own. Called
 *  after sign-in as a lazy migration. */
export async function ensureDefaultOrg(user: {
  id: string;
  name: string;
  email: string;
}): Promise<schema.OrganizationRow> {
  const existing = await listOrgsForUser(user.id);
  if (existing.length > 0) return existing[0]!;
  const slug = slugify(user.email.split("@")[0] ?? user.name ?? user.id);
  return createOrg({
    ownerUserId: user.id,
    name: `${user.name || user.email.split("@")[0]}'s workspace`,
    slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
  });
}

export async function listProjects(
  orgId: string,
): Promise<schema.ProjectRow[]> {
  return db
    .select()
    .from(schema.project)
    .where(eq(schema.project.orgId, orgId))
    .orderBy(schema.project.createdAt);
}

export async function createProject(input: {
  orgId: string;
  name: string;
}): Promise<schema.ProjectRow> {
  const [row] = await db
    .insert(schema.project)
    .values({
      id: newId("proj"),
      orgId: input.orgId,
      name: input.name,
    })
    .returning();
  if (!row) throw new Error("Failed to create project.");
  return row;
}

export async function getProject(
  projectId: string,
): Promise<schema.ProjectRow | null> {
  const [row] = await db
    .select()
    .from(schema.project)
    .where(eq(schema.project.id, projectId))
    .limit(1);
  return row ?? null;
}

export async function listApps(projectId: string): Promise<schema.AppRow[]> {
  return db
    .select()
    .from(schema.app)
    .where(eq(schema.app.projectId, projectId))
    .orderBy(schema.app.createdAt);
}

export async function createApp(input: {
  projectId: string;
  name: string;
  environment: "test" | "live";
}): Promise<{ app: schema.AppRow; publicKey: string; secretKey: string }> {
  return db.transaction(async (tx) => {
    const [appRow] = await tx
      .insert(schema.app)
      .values({
        id: newId("app"),
        projectId: input.projectId,
        name: input.name,
        environment: input.environment,
        allowedOrigins: [],
      })
      .returning();
    if (!appRow) throw new Error("Failed to create app.");

    const publicKey = newKey("public", input.environment);
    const secretKey = newKey("secret", input.environment);
    const secretHash = createHash("sha256").update(secretKey).digest("hex");

    await tx.insert(schema.apiKey).values([
      {
        id: newId("key"),
        appId: appRow.id,
        kind: "public",
        plaintext: publicKey,
        displayPrefix: publicKey.slice(0, 20),
      },
      {
        id: newId("key"),
        appId: appRow.id,
        kind: "secret",
        hash: secretHash,
        displayPrefix: secretKey.slice(0, 20),
      },
    ]);

    return { app: appRow, publicKey, secretKey };
  });
}

export async function getApp(appId: string): Promise<schema.AppRow | null> {
  const [row] = await db
    .select()
    .from(schema.app)
    .where(eq(schema.app.id, appId))
    .limit(1);
  return row ?? null;
}

export async function listKeys(appId: string): Promise<schema.ApiKeyRow[]> {
  return db
    .select()
    .from(schema.apiKey)
    .where(eq(schema.apiKey.appId, appId))
    .orderBy(schema.apiKey.createdAt);
}

/** Look up an app by its public key plaintext. Used by /v1/verify. */
export async function lookupAppByPublicKey(
  publicKey: string,
): Promise<{ app: schema.AppRow; org: schema.OrganizationRow } | null> {
  const rows = await db
    .select({
      app: schema.app,
      org: schema.organization,
      key: schema.apiKey,
    })
    .from(schema.apiKey)
    .innerJoin(schema.app, eq(schema.app.id, schema.apiKey.appId))
    .innerJoin(schema.project, eq(schema.project.id, schema.app.projectId))
    .innerJoin(
      schema.organization,
      eq(schema.organization.id, schema.project.orgId),
    )
    .where(
      and(
        eq(schema.apiKey.plaintext, publicKey),
        eq(schema.apiKey.kind, "public"),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.key.revokedAt) return null;
  return { app: row.app, org: row.org };
}

/** Bump `last_used_at` on a public key. Fire-and-forget from /v1/verify. */
export async function touchKey(publicKey: string): Promise<void> {
  await db
    .update(schema.apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKey.plaintext, publicKey));
}

export async function getMonthlyUsage(
  appId: string,
): Promise<{ transactions: number; volumeUsdc: string }> {
  const [row] = await db
    .select({
      transactions: raw<number>`count(*)::int`,
      volumeUsdc: raw<string>`coalesce(sum(${schema.event.amountUsdc}), 0)::text`,
    })
    .from(schema.event)
    .where(
      and(
        eq(schema.event.appId, appId),
        raw`date_trunc('month', ${schema.event.createdAt}) = date_trunc('month', now())`,
      ),
    );
  return row ?? { transactions: 0, volumeUsdc: "0" };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
