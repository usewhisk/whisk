/**
 * Centralized env-var lookup so every script fails the same way when
 * something is missing. Throws at module load — runs once per script.
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
  // For send.ts, payroll.ts, refund.ts — the merchant's signing key.
  privateKey: optional("PRIVATE_KEY") as `0x${string}` | undefined,

  // For webhook scripts
  webhookSecret: optional("WHISK_WEBHOOK_SECRET"),
  webhookEndpoint: optional("WHISK_WEBHOOK_ENDPOINT"),

  required,
};
