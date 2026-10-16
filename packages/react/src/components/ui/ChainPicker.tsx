"use client";

import * as Select from "@radix-ui/react-select";
import { chainInfo, type Chain } from "@usewhisk/core";
import { cn } from "../../lib/cn.js";

export type ChainPickerProps = {
  value: Chain;
  onChange: (chain: Chain) => void;
  chains: ReadonlyArray<Chain>;
  /** Optional accessible label. */
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Compact chain dropdown — Radix Select underneath so keyboard nav and
 * focus rings work out of the box. Renders the chain label from
 * `chainInfo`; visual styling routes through `--whisk-*` tokens.
 */
export function ChainPicker({
  value,
  onChange,
  chains,
  ariaLabel = "Chain",
  disabled,
  className,
}: ChainPickerProps) {
  return (
    <Select.Root
      value={value}
      onValueChange={(v) => onChange(v as Chain)}
      disabled={disabled}
    >
      <Select.Trigger
        aria-label={ariaLabel}
        className={cn("whisk-select-trigger", className)}
      >
        <Select.Value placeholder="Select chain" />
        <Select.Icon className="whisk-select-trigger__icon">
          <ChevronDown />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="whisk-select-content"
        >
          <Select.Viewport>
            {chains.map((c) => (
              <Select.Item key={c} value={c} className="whisk-select-item">
                <Select.ItemText>{chainInfo(c).label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function ChevronDown() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 4.5L6 7.5L9 4.5" />
    </svg>
  );
}
