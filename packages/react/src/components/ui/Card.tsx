"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";

/**
 * Outer surface for every Whisk widget. Themed via `whisk-card` so the
 * background, border, and radius all route through `--whisk-*` tokens.
 */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...rest }, ref) {
    return <div ref={ref} className={cn("whisk-card", className)} {...rest} />;
  },
);
