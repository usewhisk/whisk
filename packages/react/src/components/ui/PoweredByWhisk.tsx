"use client";

import { useCallback } from "react";

/**
 * "Powered by Whisk" attribution badge. Non-removable — every visual
 * property is set via inline `!important` declarations, which always
 * beat host-app CSS rules (inline > stylesheet, regardless of either
 * side using `!important`).
 *
 * The badge is auto-rendered in `<WhiskSend>` and `<WhiskReceipt>`
 * footers and exported here for custom widgets that compose the
 * lower-level primitives.
 */
export function PoweredByWhisk() {
  const apply = useCallback(applyImportantStyles, []);
  return (
    <div ref={apply} data-whisk-powered-by>
      <a
        ref={applyAnchorStyles}
        href="https://usewhisk.xyz"
        target="_blank"
        rel="noreferrer noopener"
      >
        Powered by <strong style={STRONG_INLINE}>Whisk</strong>
      </a>
    </div>
  );
}

/**
 * Wrapper-level styles. Centred horizontally, breathable padding above
 * the surrounding card edge, and never hidden by `display: none` rules.
 */
const WRAPPER_STYLES: Record<string, string> = {
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  "margin-top": "0.5rem",
  "padding-top": "0.625rem",
  visibility: "visible",
  opacity: "1",
  "pointer-events": "auto",
  position: "relative",
  "z-index": "1",
};

/**
 * Link-level styles. Routes the colour through the theme tokens so the
 * badge tracks light / dark / preset modes — the lockdown is purely
 * about visibility, not branding.
 */
const ANCHOR_STYLES: Record<string, string> = {
  display: "inline-flex",
  "align-items": "center",
  gap: "0.25rem",
  "font-family": "var(--whisk-font, system-ui, sans-serif)",
  "font-size": "0.6875rem",
  "font-weight": "400",
  "letter-spacing": "0.01em",
  color: "var(--whisk-fg-muted, currentColor)",
  "text-decoration": "none",
  opacity: "0.8",
  visibility: "visible",
  "pointer-events": "auto",
};

const STRONG_INLINE: Record<string, string> = {
  fontWeight: "600",
  color: "var(--whisk-fg, currentColor)",
};

function applyImportantStyles(el: HTMLDivElement | null) {
  if (!el) return;
  for (const [prop, value] of Object.entries(WRAPPER_STYLES)) {
    el.style.setProperty(prop, value, "important");
  }
}

function applyAnchorStyles(el: HTMLAnchorElement | null) {
  if (!el) return;
  for (const [prop, value] of Object.entries(ANCHOR_STYLES)) {
    el.style.setProperty(prop, value, "important");
  }
}
