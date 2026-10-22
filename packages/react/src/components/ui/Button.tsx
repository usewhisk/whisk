"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Rendered before `children`. */
  iconStart?: ReactNode;
  /** Rendered after `children`. */
  iconEnd?: ReactNode;
};

/** Defaults to `type="button"` so it never submits a surrounding form. */
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
