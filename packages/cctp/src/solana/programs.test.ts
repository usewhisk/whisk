import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOKEN_PROGRAM_ID } from "./programs.js";

describe("Solana program IDs", () => {
  it("names the SPL Token program that holds USDC", () => {
    expect(TOKEN_PROGRAM_ID.toBase58()).toBe(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    );
  });

  // @solana/spl-token pulls in bigint-buffer (CVE-2025-3194) for one constant.
  it("does not depend on @solana/spl-token", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(manifest.dependencies ?? {})).not.toContain(
      "@solana/spl-token",
    );
  });
});
