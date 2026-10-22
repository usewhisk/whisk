"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export type BannerVariant = "info" | "warning" | "error";

export type BannerProps = HTMLAttributes<HTMLDivElement> & {
  variant?: BannerVariant;
  /** Rendered before the text. */
  icon?: ReactNode;
  /** Rendered after the text, such as a retry or cancel button. */
  action?: ReactNode;
};

/**
 * Status banner for receipts, results, and inline alerts. Errors default to
 * `role="alert"`, everything else to `role="status"`.
 */
export function Banner({
  variant = "info",
  icon,
  action,
  children,
  className,
  role,
  ...rest
}: BannerProps) {
  const resolvedRole = role ?? (variant === "error" ? "alert" : "status");
  return (
    <div
      className={cn("whisk-banner", `whisk-banner--${variant}`, className)}
      role={resolvedRole}
      {...rest}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {action}
    </div>
  );
}
