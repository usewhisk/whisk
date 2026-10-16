/**
 * Whisk Console database schema.
 *
 * Ownership hierarchy: `organization` → `project` → `app` → `apiKey`.
 * `event` is the write-once ledger of every completed engine call,
 * keyed to the app that issued it. `usage` reads aggregate over
 * `event` monthly — the billing seam (Phase 1.7) consumes those
 * aggregates.
 *
 * All primary keys are prefixed ULIDs so a raw ID leaks its type
 * ("org_", "proj_", "app_", "key_", "evt_", "usr_"). No auto-increment
 * bigints — makes sharing IDs in URLs / support tickets less
 * ambiguous.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ---------------------------------------------------------------- *
 *  Better Auth core tables — matches the shape Better Auth's
 *  drizzleAdapter expects out of the box for the `pg` provider.
 * ---------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("session_user_idx").on(t.userId),
  }),
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    providerAccountIdx: uniqueIndex("account_provider_account_idx").on(
      t.providerId,
      t.accountId,
    ),
  }),
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ---------------------------------------------------------------- *
 *  Whisk Console domain tables.
 * ---------------------------------------------------------------- */

/** Billing tier a project can be on. Set manually in Phase 1;
 *  Phase 2 wires it to whichever web3 billing platform is picked. */
export const TIERS = ["free", "pro", "growth", "enterprise"] as const;
export type Tier = (typeof TIERS)[number];

/** Take-rate in basis points per tier. 100 bps = 1%. Values are
 *  informational for Phase 1 (surfaced in the widget's fee row); no
 *  charge happens until the billing seam is wired. */
export const TIER_BPS: Record<Tier, number> = {
  free: 15,
  pro: 10,
  growth: 5,
  enterprise: 0,
};

/** Multi-user tenant. A user can belong to N orgs; an org has N
 *  members. Projects and apps live under an org. */
export const organization = pgTable("organization", {
  id: text("id").primaryKey(), // "org_..."
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  tier: text("tier", { enum: TIERS }).notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orgMember = pgTable(
  "org_member",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.userId] }),
    userIdx: index("org_member_user_idx").on(t.userId),
  }),
);

/** A project is what a dev typically thinks of as "my app" — one per
 *  product, or one per environment. Contains N apps (typically test +
 *  live pair per environment). */
export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(), // "proj_..."
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgIdx: index("project_org_idx").on(t.orgId),
  }),
);

/** An app is what the SDK identifies via `appId`. One app owns one
 *  keypair (public + secret) per environment. Devs typically create
 *  two apps per project: one test, one live. Domain allowlist scopes
 *  where the public key is permitted to fire from. */
export const app = pgTable(
  "app",
  {
    id: text("id").primaryKey(), // "app_..."
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    environment: text("environment", { enum: ["test", "live"] })
      .notNull()
      .default("test"),
    /** Comma-free canonical origin list ("https://checkout.acme.com").
     *  Empty array = permitted from any origin (test apps only). */
    allowedOrigins: jsonb("allowed_origins")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("app_project_idx").on(t.projectId),
  }),
);

/** Individual API key. An app can rotate keys without losing its
 *  identity — old key gets revoked, new key gets issued, `appId`
 *  (the surface the SDK config accepts) stays the app's own id. */
export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(), // "key_..."
    appId: text("app_id")
      .notNull()
      .references(() => app.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["public", "secret"] }).notNull(),
    /** The full plaintext prefix that appears in the dashboard
     *  ("wsk_pk_test_...", "wsk_sk_live_..."). Stored plain for
     *  public keys (they're client-embedded anyway). Secret keys
     *  store only the SHA-256 hash in `hash` — plaintext is shown
     *  once at creation and never again. */
    plaintext: text("plaintext"), // null for secret keys
    hash: text("hash"), // null for public keys
    /** Human-readable prefix like "wsk_sk_live_abcd" for display
     *  after creation. Enough to identify the key without exposing it. */
    displayPrefix: text("display_prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    appIdx: index("api_key_app_idx").on(t.appId),
    lookupIdx: index("api_key_lookup_idx").on(t.plaintext),
  }),
);

/** Every completed engine call. Write-once, indexed by app + month so
 *  the billing aggregate stays fast. Volume USD is optional — we
 *  fill it in when the engine already has a stablecoin denomination
 *  (USDC bridges), leave it null when we don't (e.g., same-chain
 *  Solana ping). */
export const event = pgTable(
  "event",
  {
    id: text("id").primaryKey(), // "evt_..."
    appId: text("app_id")
      .notNull()
      .references(() => app.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ["send", "bridge", "refund"] }).notNull(),
    sourceChain: text("source_chain").notNull(),
    destinationChain: text("destination_chain").notNull(),
    /** USDC amount as a decimal string (e.g., "10.50"). */
    amountUsdc: numeric("amount_usdc", { precision: 20, scale: 6 }),
    /** Final settlement tx hash on the destination chain. */
    txHash: text("tx_hash"),
    /** Denormalized for fast tier lookup at ingest. */
    tierAtEvent: text("tier_at_event", { enum: TIERS }).notNull(),
    bpsAtEvent: integer("bps_at_event").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    appMonthIdx: index("event_app_month_idx").on(t.appId, t.createdAt),
  }),
);

export type UserRow = typeof user.$inferSelect;
export type OrganizationRow = typeof organization.$inferSelect;
export type ProjectRow = typeof project.$inferSelect;
export type AppRow = typeof app.$inferSelect;
export type ApiKeyRow = typeof apiKey.$inferSelect;
export type EventRow = typeof event.$inferSelect;
