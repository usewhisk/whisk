import { themePresets } from "./presets.js";
import type {
  WhiskColorMode,
  WhiskTheme,
  WhiskThemeInput,
  WhiskThemeName,
  WhiskThemeTokens,
} from "./types.js";

/**
 * Result of resolving a {@link WhiskThemeInput} into something the provider
 * can apply to the DOM. `null` means "auto" with nothing to override: CSS
 * `prefers-color-scheme` drives everything from `styles.css`.
 */
export type ResolvedTheme = {
  /**
   * Drives the `data-whisk-theme` attribute on the root element. Absent for
   * "auto", which leaves the colour scheme to CSS.
   */
  colorMode?: WhiskColorMode;
  /** Inline CSS variable map for the root element's `style` attribute. */
  vars: Record<string, string>;
};

/**
 * Resolve any accepted theme input into a {@link ResolvedTheme}.
 *
 * - `undefined` or `"auto"` → `null` (defer to CSS, no inline vars).
 * - A preset name → look up in {@link themePresets}.
 * - A `WhiskTheme` object → pass through.
 * - `{ preset, tokens }` → the preset's variables, then the tokens'.
 */
export function resolveTheme(
  input: WhiskThemeInput | undefined,
): ResolvedTheme | null {
  if (input === undefined || input === "auto") return null;
  if (typeof input === "string") {
    const preset = themePresets[input];
    return preset
      ? { colorMode: preset.colorMode, vars: themeToCssVars(preset) }
      : null;
  }
  if ("preset" in input) {
    const base =
      input.preset === "auto" ? undefined : themePresets[input.preset];
    return {
      ...(base && { colorMode: base.colorMode }),
      vars: {
        ...(base && themeToCssVars(base)),
        ...tokensToCssVars(input.tokens),
      },
    };
  }
  return { colorMode: input.colorMode, vars: themeToCssVars(input) };
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
  return tokensToCssVars({
    ...theme,
    cardFg: theme.cardFg ?? theme.fg,
    ring: theme.ring ?? theme.primary,
  });
}

const TOKEN_VARS: Record<keyof WhiskThemeTokens, string> = {
  bg: "--whisk-bg",
  fg: "--whisk-fg",
  border: "--whisk-border",
  input: "--whisk-input",
  card: "--whisk-card",
  cardFg: "--whisk-card-fg",
  primary: "--whisk-primary",
  primaryFg: "--whisk-primary-fg",
  success: "--whisk-success",
  warning: "--whisk-warning",
  destructive: "--whisk-destructive",
  destructiveFg: "--whisk-destructive-fg",
  ring: "--whisk-ring",
  fgMuted: "--whisk-fg-muted",
  radius: "--whisk-radius",
  radiusSm: "--whisk-radius-sm",
  radiusMd: "--whisk-radius-md",
  radiusLg: "--whisk-radius-lg",
  borderWidth: "--whisk-border-w",
  font: "--whisk-font",
  fontDisplay: "--whisk-font-display",
  fontMono: "--whisk-font-mono",
};

/** The `--whisk-*` variables for whichever tokens are set. */
export function tokensToCssVars(
  tokens: WhiskThemeTokens,
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, cssVar] of Object.entries(TOKEN_VARS)) {
    const value = tokens[key as keyof WhiskThemeTokens];
    if (value) vars[cssVar] = value;
  }
  return vars;
}

/** All preset names. Useful for building palette pickers in apps. */
export function listThemeNames(): WhiskThemeName[] {
  return Object.keys(themePresets) as WhiskThemeName[];
}
