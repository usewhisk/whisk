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
 * - A preset name, such as `"light"` (the default) or `"dark"`.
 * - `"auto"`: follow the visitor's `prefers-color-scheme`, in CSS alone, so
 *   it is safe to render on the server.
 * - A full {@link WhiskTheme}.
 * - `{ preset, tokens }`: a preset, or `"auto"`, with some tokens replaced.
 */
export type WhiskThemeInput =
  | WhiskThemeName
  | "auto"
  | WhiskTheme
  | WhiskThemeOverrides;

/** Any tokens of a {@link WhiskTheme}; the colour scheme comes from the preset. */
export type WhiskThemeTokens = Partial<Omit<WhiskTheme, "colorMode">>;

export type WhiskThemeOverrides = {
  preset: WhiskThemeName | "auto";
  tokens: WhiskThemeTokens;
};

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
