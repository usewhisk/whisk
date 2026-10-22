"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn.js";

export type FieldBoxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> & {
  label: ReactNode;
  /** Rendered after the input, such as a token picker or paste button. */
  suffix?: ReactNode;
  /** Helper text shown below the field. */
  help?: ReactNode;
  /** When set, the field renders as invalid and the message replaces `help`. */
  error?: ReactNode;
  /** `"amount"` enlarges the input; `"mono"` uses the monospace font. */
  variant?: "default" | "amount" | "mono";
};

/** Labelled input with a suffix slot, help text, and an error state. */
export const FieldBox = forwardRef<HTMLInputElement, FieldBoxProps>(
  function FieldBox(
    { label, suffix, help, error, variant = "default", className, ...rest },
    ref,
  ) {
    const inputId = useId();
    const helpId = useId();
    const invalid = !!error;
    const hint = error ?? help;
    return (
      <div
        className={cn(
          "whisk-fieldbox",
          variant === "amount" && "whisk-fieldbox--amount",
          variant === "mono" && "whisk-fieldbox--mono",
          invalid && "whisk-fieldbox--invalid",
          className,
        )}
      >
        <label className="whisk-fieldbox__label" htmlFor={inputId}>
          {label}
        </label>
        <div className="whisk-fieldbox__control">
          <input
            ref={ref}
            id={inputId}
            aria-invalid={invalid || undefined}
            aria-describedby={hint ? helpId : undefined}
            {...rest}
          />
          {suffix ? (
            <div className="whisk-fieldbox__suffix">{suffix}</div>
          ) : null}
        </div>
        {hint ? (
          <p
            id={helpId}
            className={cn("whisk-help", invalid && "whisk-help--error")}
            role={invalid ? "alert" : undefined}
          >
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
