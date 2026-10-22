import type { WhiskTheme, WhiskThemeName } from "./types.js";

/** `light` and `dark` must match the defaults in `styles.css`. */
export const themePresets: Record<WhiskThemeName, WhiskTheme> = {
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

/** Returns `undefined` at runtime for a name that is not a preset. */
export function getThemePreset(name: WhiskThemeName): WhiskTheme {
  return themePresets[name];
}
