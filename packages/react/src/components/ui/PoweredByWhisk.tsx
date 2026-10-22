"use client";

import { useCallback } from "react";

/**
 * Attribution badge that host CSS cannot hide: its styles are inline
 * `!important` declarations, which beat any stylesheet rule. `<WhiskSend>`
 * and `<WhiskReceipt>` render it already; export it for custom widgets.
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

/** Colours come from the theme; only visibility is locked down. */
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
