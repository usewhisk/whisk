/**
 * Theme types for the Whisk widget.
 *
 * A {@link WhiskTheme} is a flat record describing the widget's appearance.
 * Each field maps to one or more `--whisk-*` CSS variables on the root
 * `[data-whisk]` element. Optional fields fall back to sensible derivations
 * (e.g. `fgMuted` is computed from `fg` if omitted).
 *
 * `WhiskThemeName` lists the named presets shipped by `@usewhisk/react`.
 * `WhiskThemeInput` is the union the provider accepts.
 */

export type WhiskColorMode = "light" | "dark";

/** Six built-in palettes shipped with `@usewhisk/react`. */
export type WhiskThemeName =
  | "light"
  | "dark"
  | "wine"
  | "indigo"
  | "emerald"
  | "monochrome";

/**
 * What `<WhiskProvider theme={...}>` accepts.
 *
 * - `"system"` — defer to the user's `prefers-color-scheme` setting (no
 *   inline overrides). The styles.css defaults apply.
 * - A {@link WhiskThemeName} preset.
 * - A custom {@link WhiskTheme} object for full control.
 */
export type WhiskThemeInput = WhiskThemeName | WhiskTheme | "system";

/**
 * A fully-specified theme. Drives the `--whisk-*` CSS variables on the root
 * `[data-whisk]` element.
 *
 * The required fields cover the colors that every widget surface depends on.
 * Optional fields override the defaults from `styles.css` only when set.
 */
export type WhiskTheme = {
  /** Whether the widget should render in light or dark mode. Drives the `data-whisk-theme` attribute. */
  colorMode: WhiskColorMode;

  /** Page-equivalent background of the widget surface. */
  bg: string;
  /** Primary text color. */
  fg: string;
  /** Border color for cards, inputs, dividers. */
  border: string;
  /** Background of form inputs (also used as alternate border). */
  input: string;
  /** Background of card containers (slightly differs from `bg` in most themes). */
  card: string;
  /** Foreground of card containers. Defaults to `fg`. */
  cardFg?: string;
  /** Primary action / accent color (buttons, focus ring). */
  primary: string;
  /** Foreground rendered on top of `primary` (e.g. button label). */
  primaryFg: string;
  /** Success state color (toasts, badges). */
  success: string;
  /** Warning state color. */
  warning: string;
  /** Destructive / error state color. */
  destructive: string;
  /** Foreground on top of `destructive`. */
  destructiveFg: string;

  // ── Optional overrides ──────────────────────────────────────────

  /**
   * Muted text. Defaults to `color-mix(in srgb, fg 75%, transparent)`. Override
   * if you want a literal hex value rather than a derived alpha.
   */
  fgMuted?: string;
  /** Focus-ring color. Defaults to `primary`. */
  ring?: string;
  /** Radius for fields and buttons. */
  radius?: string;
  /** Small radius (badges). */
  radiusSm?: string;
  /** Medium radius (alias for `radius`). */
  radiusMd?: string;
  /** Large radius (cards). */
  radiusLg?: string;
  /** Border width (e.g. `"0.5px"` for hairline). */
  borderWidth?: string;
  /** Default font stack. */
  font?: string;
  /** Display font stack (headlines, big numbers). */
  fontDisplay?: string;
  /** Monospace font stack (code, hashes). */
  fontMono?: string;
};
