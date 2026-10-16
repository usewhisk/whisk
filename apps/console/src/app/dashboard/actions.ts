"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  createApp,
  createOrg,
  createProject,
  requireOrgMembership,
} from "@/lib/orgs";

export async function createOrgAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Organization name is required.");
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const org = await createOrg({
    ownerUserId: user.id,
    name,
    slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
  });
  revalidatePath("/dashboard");
  redirect(`/dashboard/${org.id}`);
}

export async function createProjectAction(formData: FormData) {
  const user = await requireUser();
  const orgId = String(formData.get("orgId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Project name is required.");
  await requireOrgMembership(orgId, user.id);
  const project = await createProject({ orgId, name });
  revalidatePath(`/dashboard/${orgId}`);
  redirect(`/dashboard/${orgId}/${project.id}`);
}

export async function createAppAction(formData: FormData) {
  const user = await requireUser();
  const orgId = String(formData.get("orgId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const environment =
    String(formData.get("environment") ?? "test") === "live" ? "live" : "test";
  if (!name) throw new Error("App name is required.");
  await requireOrgMembership(orgId, user.id);
  const result = await createApp({ projectId, name, environment });
  revalidatePath(`/dashboard/${orgId}/${projectId}`);
  // Redirect to app page with the freshly-minted secret in the URL —
  // the app page reads it once and shows the reveal card, then it's
  // gone forever.
  redirect(
    `/dashboard/${orgId}/${projectId}/${result.app.id}?reveal=${encodeURIComponent(result.secretKey)}`,
  );
}
