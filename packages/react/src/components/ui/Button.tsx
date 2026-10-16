"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading icon — rendered to the left of `children`. */
  iconStart?: ReactNode;
  /** Optional trailing icon — rendered to the right of `children`. */
  iconEnd?: ReactNode;
};

/**
 * Base button primitive. Routes every visual property through the
 * `whisk-button` CSS class system so the theme tokens take effect
 * without prop drilling.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      iconStart,
      iconEnd,
      className,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "whisk-button",
          `whisk-button--${variant}`,
          size === "sm" && "whisk-button--sm",
          className,
        )}
        {...rest}
      >
        {iconStart}
        {children}
        {iconEnd}
      </button>
    );
  },
);
