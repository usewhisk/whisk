"use client";

import * as Select from "@radix-ui/react-select";
import { getChain, type Chain } from "@usewhisk/core";
import { cn } from "../../lib/cn.js";
import { useWhiskPortal } from "../../provider/portal.js";

export type ChainPickerProps = {
  value: Chain;
  onChange: (chain: Chain) => void;
  chains: ReadonlyArray<Chain>;
  /** Accessible label. Defaults to `"Chain"`. */
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * The list renders into the widget's portal so it keeps the theme, which a
 * portal on `document.body` would lose.
 */
export function ChainPicker({
  value,
  onChange,
  chains,
  ariaLabel = "Chain",
  disabled,
  className,
}: ChainPickerProps) {
  const portal = useWhiskPortal();
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
      <Select.Portal container={portal}>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="whisk-select-content"
        >
          <Select.Viewport>
            {chains.map((c) => (
              <Select.Item key={c} value={c} className="whisk-select-item">
                <Select.ItemText>{getChain(c).label}</Select.ItemText>
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
