/**
 * Lockdown contract for the "Powered by Whisk" badge.
 *
 * The runtime guarantee — that inline `!important` always beats
 * stylesheet `!important` — is a CSS spec rule we trust the browser to
 * enforce. What we DO test here is that the badge source-level commits
 * to the lockdown: every visibility-critical property must use
 * `setProperty(prop, value, "important")`, not the React `style` prop.
 *
 * A bare `style={{ display: "flex" }}` ships without `!important` and
 * loses to any host rule. This test reads the module's TS source and
 * fails if `style.setProperty` isn't applied to every property that
 * controls whether the badge renders.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "PoweredByWhisk.tsx"), "utf8");

const VISIBILITY_PROPS = ["display", "visibility", "opacity", "pointer-events"];

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("PoweredByWhisk lockdown", () => {
  it("uses setProperty(..., 'important') instead of React style", () => {
    expect(SOURCE).toContain('setProperty(prop, value, "important")');
  });

  it("commits every visibility-critical property to !important", () => {
    for (const prop of VISIBILITY_PROPS) {
      // Match `display: "..."` (unquoted JS key) or `"display": "..."`
      // (quoted key, used for hyphenated CSS names like `pointer-events`).
      const unquoted = new RegExp(`(^|\\s)${escape(prop)}:\\s*"[^"]+"`, "m");
      const quoted = new RegExp(`"${escape(prop)}":\\s*"[^"]+"`);
      const found = unquoted.test(SOURCE) || quoted.test(SOURCE);
      expect(found, `missing inline declaration for "${prop}"`).toBe(true);
    }
  });

  it("links to usewhisk.xyz with a secure rel attribute", () => {
    expect(SOURCE).toContain('href="https://usewhisk.xyz"');
    expect(SOURCE).toContain('rel="noreferrer noopener"');
    expect(SOURCE).toContain('target="_blank"');
  });

  it("renders the Whisk wordmark", () => {
    expect(SOURCE).toContain("Powered by");
    expect(SOURCE).toMatch(/<strong[^>]*>Whisk<\/strong>/);
  });

  it("does not expose an opt-out prop", () => {
    // `function PoweredByWhisk()` with zero args is the lockdown.
    expect(SOURCE).toMatch(/export function PoweredByWhisk\(\)/);
  });
});
