"use client";

import type { Dispatch } from "react";
import type { FeeBearer } from "@usewhisk/react";
import type { PlaygroundAction, PlaygroundConfig, Theme } from "./store";

/**
 * Preset setups such as checkout, donate, invoice and payroll live in their
 * own apps under `examples/`.
 */
export function Controls({
  config,
  dispatch,
}: {
  config: PlaygroundConfig;
  dispatch: Dispatch<PlaygroundAction>;
}) {
  const set = (patch: Partial<PlaygroundConfig>) =>
    dispatch({ type: "SET_CONFIG", patch });

  return (
    <aside className="pg-controls" aria-label="Playground controls">
      <Section title="Theme">
        <ThemePicker
          value={config.theme}
          onChange={(theme) => set({ theme })}
        />
      </Section>

      <Section title="Fee bearer">
        <FeeBearerPicker
          value={config.feeBearer}
          onChange={(feeBearer) => set({ feeBearer })}
        />
        <span className="pg-toggle__hint">
          {config.feeBearer === "sender"
            ? "Burn is grossed up so the recipient nets the full amount. Switching reconnects the widget."
            : "Fees come out of the transfer; recipient nets amount − fees. Switching reconnects the widget."}
        </span>
      </Section>

      <Section title="Tabs">
        <TabsPicker value={config.tabs} onChange={(tabs) => set({ tabs })} />
      </Section>

      <Section title="Inspector">
        <details className="pg-inspector">
          <summary>Live config (JSON)</summary>
          <pre>{JSON.stringify(config, null, 2)}</pre>
        </details>
        <p className="pg-faucets">
          Need testnet USDC?{" "}
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
            Circle faucet ↗
          </a>
        </p>
      </Section>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pg-section">
      <h3 className="pg-section__title">{title}</h3>
      <div className="pg-section__body">{children}</div>
    </section>
  );
}

function ThemePicker({
  value,
  onChange,
}: {
  value: Theme;
  onChange: (t: Theme) => void;
}) {
  const options: Theme[] = ["auto", "light", "dark"];
  return (
    <div role="radiogroup" className="pg-radio-group" aria-label="Theme">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={value === opt}
          className="pg-radio"
          data-active={value === opt ? "true" : "false"}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function FeeBearerPicker({
  value,
  onChange,
}: {
  value: FeeBearer;
  onChange: (f: FeeBearer) => void;
}) {
  const options: FeeBearer[] = ["sender", "receiver"];
  return (
    <div role="radiogroup" className="pg-radio-group" aria-label="Fee bearer">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={value === opt}
          className="pg-radio"
          data-active={value === opt ? "true" : "false"}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

type TabsSelection = ReadonlyArray<"send" | "bridge">;

function TabsPicker({
  value,
  onChange,
}: {
  value: TabsSelection;
  onChange: (t: TabsSelection) => void;
}) {
  const preset: Array<{ id: string; label: string; tabs: TabsSelection }> = [
    { id: "both", label: "Send + Bridge", tabs: ["send", "bridge"] },
    { id: "send", label: "Send only", tabs: ["send"] },
    { id: "bridge", label: "Bridge only", tabs: ["bridge"] },
  ];
  const activeId =
    value.length === 2
      ? "both"
      : value[0] === "send"
        ? "send"
        : value[0] === "bridge"
          ? "bridge"
          : "both";
  return (
    <div role="radiogroup" className="pg-radio-group" aria-label="Tabs">
      {preset.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={activeId === p.id}
          className="pg-radio"
          data-active={activeId === p.id ? "true" : "false"}
          onClick={() => onChange(p.tabs)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
