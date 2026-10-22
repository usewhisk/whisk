import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { themePresets } from "./presets.js";
import { themeToCssVars } from "./resolve.js";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block in styles.css`);
  const body = css.slice(start, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(
    /(--whisk-[\w-]+):\s*([^;]+);/g,
  )) {
    vars[name!] = value!.trim();
  }
  return vars;
}

// The provider writes no inline variables for `light` and `dark`, so these
// blocks are the palettes users see.
describe("styles.css palettes", () => {
  it.each([
    ["light", "[data-whisk]"],
    ["dark", '[data-whisk]:where([data-whisk-theme="dark"], .dark)'],
  ] as const)("%s matches its preset", (name, selector) => {
    // Both blocks apply to the same element, so dark falls back to the base.
    const sheet = { ...block("[data-whisk]"), ...block(selector) };
    for (const [key, value] of Object.entries(
      themeToCssVars(themePresets[name]),
    )) {
      const inSheet = sheet[key] ?? "";
      const resolved = inSheet.startsWith("var(")
        ? sheet[inSheet.slice(4, -1)]
        : inSheet;
      expect([key, resolved]).toEqual([key, value]);
    }
  });
});
