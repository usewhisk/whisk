/**
 * Each script calls `env.required` for what it needs, so a missing variable
 * fails with the same message everywhere.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(
      `Missing env var: ${name}. Add it to your .env or shell before running this script.`,
    );
  }
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export const env = {
  // The merchant's signing key, used by send.ts, payroll.ts and refund.ts.
  privateKey: optional("PRIVATE_KEY") as `0x${string}` | undefined,

  webhookSecret: optional("WHISK_WEBHOOK_SECRET"),
  webhookEndpoint: optional("WHISK_WEBHOOK_ENDPOINT"),

  required,
};
