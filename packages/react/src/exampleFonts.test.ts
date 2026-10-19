import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CI builds every example. `next/font/google` downloads the fonts during
// `next build` and fails the build whenever Google's reply is not what it
// parses, so the examples load fonts from files in the repo.
const EXAMPLES = fileURLToPath(new URL("../../../examples/", import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    // Build output and dependencies are not the examples' own source.
    if (["node_modules", "dist"].includes(entry.name)) return [];
    if (entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(tsx?|jsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

describe("example fonts", () => {
  it("come from files in the repo, so a build needs no font server", () => {
    const remote = sources(EXAMPLES)
      .filter((file) =>
        /next\/font\/google|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(EXAMPLES, file));
    expect(remote).toEqual([]);
  });
});
