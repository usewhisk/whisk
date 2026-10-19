import { describe, expect, it } from "vitest";
import { themePresets } from "./presets.js";
import { listThemeNames, resolveTheme, themeToCssVars } from "./resolve.js";
import type { WhiskTheme } from "./types.js";

describe("resolveTheme", () => {
  it("returns null for undefined", () => {
    expect(resolveTheme(undefined)).toBeNull();
  });

  it("returns null for 'auto' (defer to CSS prefers-color-scheme)", () => {
    expect(resolveTheme("auto")).toBeNull();
  });

  it("resolves the 'light' preset", () => {
    const result = resolveTheme("light");
    expect(result).not.toBeNull();
    expect(result!.colorMode).toBe("light");
    expect(result!.vars["--whisk-bg"]).toBe("#cdc3a3");
    expect(result!.vars["--whisk-primary"]).toBe("#d65c3c");
  });

  it("resolves the 'dark' preset", () => {
    const result = resolveTheme("dark");
    expect(result!.colorMode).toBe("dark");
    expect(result!.vars["--whisk-bg"]).toBe("#2a1d21");
  });

  it("resolves the 'wine' preset", () => {
    const result = resolveTheme("wine");
    expect(result!.colorMode).toBe("light");
    expect(result!.vars["--whisk-primary"]).toBe("#8b1538");
  });

  it("resolves the 'indigo' preset", () => {
    const result = resolveTheme("indigo");
    expect(result!.vars["--whisk-primary"]).toBe("#6366f1");
  });

  it("resolves the 'emerald' preset", () => {
    const result = resolveTheme("emerald");
    expect(result!.vars["--whisk-primary"]).toBe("#10b981");
  });

  it("resolves the 'monochrome' preset", () => {
    const result = resolveTheme("monochrome");
    expect(result!.vars["--whisk-primary"]).toBe("#0a0a0a");
    expect(result!.vars["--whisk-primary-fg"]).toBe("#ffffff");
  });

  it("passes a WhiskTheme object through directly", () => {
    const custom: WhiskTheme = {
      colorMode: "dark",
      bg: "#000000",
      fg: "#ffffff",
      border: "#222222",
      input: "#111111",
      card: "#0a0a0a",
      primary: "#ff00ff",
      primaryFg: "#ffffff",
      success: "#00ff00",
      warning: "#ffff00",
      destructive: "#ff0000",
      destructiveFg: "#ffffff",
    };
    const result = resolveTheme(custom);
    expect(result!.colorMode).toBe("dark");
    expect(result!.vars["--whisk-primary"]).toBe("#ff00ff");
  });
});

describe("themeToCssVars", () => {
  it("emits the full required variable set", () => {
    const vars = themeToCssVars(themePresets.light);
    const required = [
      "--whisk-bg",
      "--whisk-fg",
      "--whisk-border",
      "--whisk-input",
      "--whisk-card",
      "--whisk-card-fg",
      "--whisk-primary",
      "--whisk-primary-fg",
      "--whisk-success",
      "--whisk-warning",
      "--whisk-destructive",
      "--whisk-destructive-fg",
      "--whisk-ring",
    ];
    for (const key of required) {
      expect(vars[key], `missing ${key}`).toBeDefined();
    }
  });

  it("derives card-fg from fg when cardFg is omitted", () => {
    const minimal: WhiskTheme = {
      ...themePresets.light,
      cardFg: undefined,
    };
    const vars = themeToCssVars(minimal);
    expect(vars["--whisk-card-fg"]).toBe(minimal.fg);
  });

  it("derives ring from primary when ring is omitted", () => {
    const vars = themeToCssVars(themePresets.indigo);
    expect(vars["--whisk-ring"]).toBe(themePresets.indigo.primary);
  });

  it("includes optional radius/font fields only when set", () => {
    const sparse = themeToCssVars(themePresets.light);
    expect(sparse["--whisk-radius"]).toBeUndefined();
    expect(sparse["--whisk-font"]).toBeUndefined();

    const rich = themeToCssVars({
      ...themePresets.light,
      radius: "0.5rem",
      radiusSm: "0.25rem",
      radiusMd: "0.5rem",
      radiusLg: "1rem",
      borderWidth: "1px",
      font: "Inter, sans-serif",
      fontDisplay: "Cabinet Grotesk, sans-serif",
      fontMono: "JetBrains Mono, monospace",
      fgMuted: "#888888",
    });
    expect(rich["--whisk-radius"]).toBe("0.5rem");
    expect(rich["--whisk-radius-sm"]).toBe("0.25rem");
    expect(rich["--whisk-radius-lg"]).toBe("1rem");
    expect(rich["--whisk-border-w"]).toBe("1px");
    expect(rich["--whisk-font"]).toBe("Inter, sans-serif");
    expect(rich["--whisk-font-display"]).toBe("Cabinet Grotesk, sans-serif");
    expect(rich["--whisk-font-mono"]).toBe("JetBrains Mono, monospace");
    expect(rich["--whisk-fg-muted"]).toBe("#888888");
  });

  it("is deterministic — same input emits the same map", () => {
    const a = themeToCssVars(themePresets.indigo);
    const b = themeToCssVars(themePresets.indigo);
    expect(a).toEqual(b);
  });
});

describe("listThemeNames", () => {
  it("returns the six built-in names", () => {
    const names = listThemeNames();
    expect(names).toContain("light");
    expect(names).toContain("dark");
    expect(names).toContain("wine");
    expect(names).toContain("indigo");
    expect(names).toContain("emerald");
    expect(names).toContain("monochrome");
    expect(names).toHaveLength(6);
  });
});

describe("preset snapshots (deterministic CSS output per preset)", () => {
  // One snapshot per preset locks the exact CSS variable map. Any color
  // change becomes a visible test diff, prevents accidental palette drift.
  it("light", () => {
    expect(themeToCssVars(themePresets.light)).toMatchInlineSnapshot(`
      {
        "--whisk-bg": "#cdc3a3",
        "--whisk-border": "#b09382",
        "--whisk-card": "#cdc3a3",
        "--whisk-card-fg": "#56363d",
        "--whisk-destructive": "#b23a3a",
        "--whisk-destructive-fg": "#fbf8ee",
        "--whisk-fg": "#56363d",
        "--whisk-input": "#b09382",
        "--whisk-primary": "#d65c3c",
        "--whisk-primary-fg": "#fbf8ee",
        "--whisk-ring": "#d65c3c",
        "--whisk-success": "#6b8e4e",
        "--whisk-warning": "#d69a3c",
      }
    `);
  });
});
