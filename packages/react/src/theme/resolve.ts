import { themePresets } from "./presets.js";
import type {
  WhiskColorMode,
  WhiskTheme,
  WhiskThemeInput,
  WhiskThemeName,
} from "./types.js";

/**
 * Result of resolving a {@link WhiskThemeInput} into something the provider
 * can apply to the DOM. `null` means "system" — let CSS prefers-color-scheme
 * drive everything from `styles.css` without inline overrides.
 */
export type ResolvedTheme = {
  /** Drives the `data-whisk-theme` attribute on the root element. */
  colorMode: WhiskColorMode;
  /** Inline CSS variable map for the root element's `style` attribute. */
  vars: Record<string, string>;
};

/**
 * Resolve any accepted theme input into a {@link ResolvedTheme}.
 *
 * - `undefined` or `"system"` → `null` (defer to CSS, no inline vars).
 * - A preset name → look up in {@link themePresets}.
 * - A `WhiskTheme` object → pass through.
 */
export function resolveTheme(
  input: WhiskThemeInput | undefined,
): ResolvedTheme | null {
  if (input === undefined || input === "system") return null;
  const theme = typeof input === "string" ? themePresets[input] : input;
  if (!theme) return null;
  return {
    colorMode: theme.colorMode,
    vars: themeToCssVars(theme),
  };
}

/**
 * Serialize a {@link WhiskTheme} into a `--whisk-*` CSS variable map. Optional
 * fields are included only when present so the styles.css fallback applies
 * everywhere else (no spurious resets).
 *
 * Pure function. Same input → same output. Safe to call during render and
 * to snapshot in tests.
 */
export function themeToCssVars(theme: WhiskTheme): Record<string, string> {
  const vars: Record<string, string> = {
    "--whisk-bg": theme.bg,
    "--whisk-fg": theme.fg,
    "--whisk-border": theme.border,
    "--whisk-input": theme.input,
    "--whisk-card": theme.card,
    "--whisk-card-fg": theme.cardFg ?? theme.fg,
    "--whisk-primary": theme.primary,
    "--whisk-primary-fg": theme.primaryFg,
    "--whisk-success": theme.success,
    "--whisk-warning": theme.warning,
    "--whisk-destructive": theme.destructive,
    "--whisk-destructive-fg": theme.destructiveFg,
    "--whisk-ring": theme.ring ?? theme.primary,
  };
  if (theme.fgMuted) vars["--whisk-fg-muted"] = theme.fgMuted;
  if (theme.radius) vars["--whisk-radius"] = theme.radius;
  if (theme.radiusSm) vars["--whisk-radius-sm"] = theme.radiusSm;
  if (theme.radiusMd) vars["--whisk-radius-md"] = theme.radiusMd;
  if (theme.radiusLg) vars["--whisk-radius-lg"] = theme.radiusLg;
  if (theme.borderWidth) vars["--whisk-border-w"] = theme.borderWidth;
  if (theme.font) vars["--whisk-font"] = theme.font;
  if (theme.fontDisplay) vars["--whisk-font-display"] = theme.fontDisplay;
  if (theme.fontMono) vars["--whisk-font-mono"] = theme.fontMono;
  return vars;
}

/** All preset names. Useful for building palette pickers in apps. */
export function listThemeNames(): WhiskThemeName[] {
  return Object.keys(themePresets) as WhiskThemeName[];
}
