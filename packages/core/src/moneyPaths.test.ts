import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGES = fileURLToPath(new URL("../../", import.meta.url));
const SOURCES = ["cctp/src", "core/src", "react/src"];

// Any directory or file named fees*, engine* or quote* handles amounts.
const MONEY_PATH = /(^|\/)(fees|engine|quote)[^/]*(\/|$)/;
const FLOAT_MATHS =
  /\bparseFloat\(|\bNumber\(|\.toFixed\(|\bMath\.(ceil|floor|round)\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe("money paths", () => {
  it("never convert amounts or fees through a float", () => {
    const hits: string[] = [];
    for (const src of SOURCES) {
      for (const file of sourceFiles(join(PACKAGES, src))) {
        const path = relative(PACKAGES, file);
        if (!MONEY_PATH.test(path.slice(src.length + 1))) continue;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (FLOAT_MATHS.test(line)) hits.push(`${path}:${i + 1}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });
});
