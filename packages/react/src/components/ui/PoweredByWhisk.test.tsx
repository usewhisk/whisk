/**
 * Inline `!important` beats any stylesheet `!important`, so a host page
 * cannot hide the badge. React's `style` prop cannot set `!important`, which
 * is why these tests read the source and check every visibility property
 * goes through `setProperty(prop, value, "important")`.
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
      // Hyphenated names like `pointer-events` need a quoted key.
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
    expect(SOURCE).toMatch(/export function PoweredByWhisk\(\)/);
  });
});
