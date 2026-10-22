/**
 * Optional Tailwind preset. Add it to `presets` in your Tailwind config to
 * write `bg-whisk-primary`, `text-whisk-fg-muted`, `rounded-whisk` and so on.
 * The CSS variables still come from `styles.css`.
 *
 * @example
 *   // tailwind.config.ts
 *   import type { Config } from "tailwindcss";
 *   import { whiskTheme } from "@usewhisk/react/tailwind";
 *
 *   export default {
 *     presets: [whiskTheme()],
 *     content: [...],
 *   } satisfies Config;
 */

const v = (name: string) => `var(--whisk-${name})`;

export type WhiskThemeOptions = {
  /**
   * Prefix applied to every Whisk-mapped Tailwind class.
   * @default "whisk"
   */
  prefix?: string;
};

/**
 * Colours are emitted as `var(--whisk-...)`, not HSL channels, because the
 * variables hold hex values. Opacity has to come from `color-mix()` rather
 * than the channel/alpha pattern shadcn uses.
 */
export function whiskTheme(options: WhiskThemeOptions = {}) {
  const prefix = options.prefix ?? "whisk";
  return {
    theme: {
      extend: {
        colors: {
          [`${prefix}-bg`]: v("bg"),
          [`${prefix}-fg`]: v("fg"),
          [`${prefix}-fg-muted`]: v("fg-muted"),
          [`${prefix}-card`]: v("card"),
          [`${prefix}-card-fg`]: v("card-fg"),
          [`${prefix}-border`]: v("border"),
          [`${prefix}-input`]: v("input"),
          [`${prefix}-ring`]: v("ring"),
          [`${prefix}-primary`]: v("primary"),
          [`${prefix}-primary-fg`]: v("primary-fg"),
          [`${prefix}-success`]: v("success"),
          [`${prefix}-warning`]: v("warning"),
          [`${prefix}-destructive`]: v("destructive"),
          [`${prefix}-destructive-fg`]: v("destructive-fg"),
        },
        borderRadius: {
          [prefix]: "var(--whisk-radius)",
          [`${prefix}-sm`]: "var(--whisk-radius-sm)",
          [`${prefix}-lg`]: "var(--whisk-radius-lg)",
        },
        fontFamily: {
          [prefix]: "var(--whisk-font)",
          [`${prefix}-mono`]: "var(--whisk-font-mono)",
        },
      },
    },
  };
}

export default whiskTheme;
