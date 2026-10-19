"use client";

import { createContext, useContext } from "react";

/**
 * The element inside `[data-whisk]` that dialogs, menus and popovers render
 * into, so they keep the widget's styles and theme.
 */
export const WhiskPortalContext = createContext<HTMLElement | null>(null);

export function useWhiskPortal(): HTMLElement | null {
  return useContext(WhiskPortalContext);
}
