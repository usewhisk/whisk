import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./fonts.css", import.meta.url), "utf8");

// Font hosts move files without notice; a path pinned to an npm version on
// jsDelivr never changes.
const PINNED =
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource-variable\/[a-z-]+@\d+\.\d+\.\d+\/files\/[a-z0-9-]+\.woff2$/;

describe("fonts.css", () => {
  const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(
    (m) => m[1]!,
  );

  it("loads every file from a pinned package version", () => {
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((url) => !PINNED.test(url))).toEqual([]);
  });

  it.each(["Inter", "Familjen Grotesk", "Geist Mono"])(
    "declares %s",
    (family) => {
      expect(css).toContain(`font-family: "${family}";`);
    },
  );
});
