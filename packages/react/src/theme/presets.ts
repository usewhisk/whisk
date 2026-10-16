import type { WhiskTheme, WhiskThemeName } from "./types.js";

/**
 * Six built-in theme presets. Each one is a fully-specified {@link WhiskTheme}.
 *
 * `light` and `dark` mirror the defaults in `styles.css` so consumers who
 * pass `theme="light"` or `theme="dark"` see no visual change from before
 * this API shipped.
 *
 * `wine`, `indigo`, `emerald`, and `monochrome` are alternative palettes.
 * `indigo` and `emerald` use color values previously validated in the
 * playground's palette picker.
 */
export const themePresets: Record<WhiskThemeName, WhiskTheme> = {
  // ── light: matches styles.css default (cream + terracotta) ────────
  light: {
    colorMode: "light",
    bg: "#cdc3a3",
    fg: "#56363d",
    border: "#b09382",
    input: "#b09382",
    card: "#cdc3a3",
    cardFg: "#56363d",
    primary: "#d65c3c",
    primaryFg: "#fbf8ee",
    success: "#6b8e4e",
    warning: "#d69a3c",
    destructive: "#b23a3a",
    destructiveFg: "#fbf8ee",
  },

  // ── dark: matches styles.css dark variant (deep wine + terracotta) ─
  dark: {
    colorMode: "dark",
    bg: "#2a1d21",
    fg: "#e4e2d4",
    border: "#5c3f46",
    input: "#5c3f46",
    card: "#33232a",
    cardFg: "#e4e2d4",
    primary: "#d65c3c",
    primaryFg: "#fbf8ee",
    success: "#87a468",
    warning: "#e1a854",
    destructive: "#c84a4a",
    destructiveFg: "#fbf8ee",
  },

  // ── wine: dramatic deep-wine accent on cream (light mode) ─────────
  wine: {
    colorMode: "light",
    bg: "#fbf6f0",
    fg: "#4a1c2c",
    border: "#d4b8b8",
    input: "#d4b8b8",
    card: "#ffffff",
    cardFg: "#4a1c2c",
    primary: "#8b1538",
    primaryFg: "#ffffff",
    success: "#16a34a",
    warning: "#d97706",
    destructive: "#dc2626",
    destructiveFg: "#ffffff",
  },

  // ── indigo: light mode + indigo (from playground) ─────────────────
  indigo: {
    colorMode: "light",
    bg: "#f5f6fc",
    fg: "#1e1b4b",
    border: "#c0c4ea",
    input: "#c0c4ea",
    card: "#ffffff",
    cardFg: "#1e1b4b",
    primary: "#6366f1",
    primaryFg: "#ffffff",
    success: "#16a34a",
    warning: "#d97706",
    destructive: "#dc2626",
    destructiveFg: "#ffffff",
  },

  // ── emerald: light mode + emerald (from playground) ───────────────
  emerald: {
    colorMode: "light",
    bg: "#f3fbf6",
    fg: "#064e3b",
    border: "#a7d4be",
    input: "#a7d4be",
    card: "#ffffff",
    cardFg: "#064e3b",
    primary: "#10b981",
    primaryFg: "#ffffff",
    success: "#16a34a",
    warning: "#d97706",
    destructive: "#dc2626",
    destructiveFg: "#ffffff",
  },

  // ── monochrome: pure grayscale (light mode, no chromatic accent) ──
  monochrome: {
    colorMode: "light",
    bg: "#ffffff",
    fg: "#0a0a0a",
    border: "#e5e5e5",
    input: "#e5e5e5",
    card: "#fafafa",
    cardFg: "#0a0a0a",
    primary: "#0a0a0a",
    primaryFg: "#ffffff",
    success: "#16a34a",
    warning: "#d97706",
    destructive: "#dc2626",
    destructiveFg: "#ffffff",
  },
};

/** Lookup helper. Returns `undefined` for unknown names so callers can `??` to a default. */
export function getThemePreset(name: WhiskThemeName): WhiskTheme {
  return themePresets[name];
}
