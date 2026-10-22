// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  AlbedoModule: class {},
  FreighterModule: class {},
  HanaModule: class {},
  HotWalletModule: class {},
  LobstrModule: class {},
  RabetModule: class {},
  StellarWalletsKit: class {},
  WalletNetwork: {},
  xBullModule: class {},
}));
vi.mock("@starknet-io/get-starknet-core", () => ({ getStarknet: vi.fn() }));

const { WhiskProvider } = await import("./WhiskProvider.js");
const { evm } = await import("../config/adapters/evm.js");
const { themePresets } = await import("../theme/presets.js");

afterEach(cleanup);

function root(theme?: Parameters<typeof WhiskProvider>[0]["theme"]) {
  const { container } = render(
    <WhiskProvider
      config={{ chains: ["Base"], wallets: [evm({ chains: ["Base"] })] }}
      {...(theme !== undefined && { theme })}
    >
      <span />
    </WhiskProvider>,
  );
  const el = container.querySelector<HTMLElement>("[data-whisk]");
  if (!el) throw new Error("no [data-whisk] root");
  return el;
}

describe("WhiskProvider themes (#73)", () => {
  // styles.css already holds the light and dark palettes. Writing them inline
  // as well would beat every host rule on `[data-whisk]`.
  it.each([undefined, "light", "dark"] as const)(
    "leaves the %s palette to styles.css so host overrides still win",
    (theme) => {
      const el = root(theme);
      expect(el.dataset.whiskTheme).toBe(theme ?? "light");
      expect(el.getAttribute("style")).toBeNull();
    },
  );

  it("writes the other presets inline", () => {
    const el = root("indigo");
    expect(el.style.getPropertyValue("--whisk-bg")).toBe(
      themePresets.indigo.bg,
    );
  });

  it("leaves 'auto' to the visitor's colour scheme", () => {
    const el = root("auto");
    expect(el.dataset.whiskTheme).toBeUndefined();
    expect(el.style.getPropertyValue("--whisk-bg")).toBe("");
  });

  it("applies token overrides on top of a preset", () => {
    const el = root({ preset: "dark", tokens: { primary: "#123456" } });
    expect(el.dataset.whiskTheme).toBe("dark");
    expect(el.style.getPropertyValue("--whisk-primary")).toBe("#123456");
    expect(el.style.getPropertyValue("--whisk-bg")).toBe("");
  });

  it("applies token overrides to 'auto' without pinning a colour scheme", () => {
    const el = root({ preset: "auto", tokens: { radius: "0px" } });
    expect(el.dataset.whiskTheme).toBeUndefined();
    expect(el.style.getPropertyValue("--whisk-radius")).toBe("0px");
    expect(el.style.getPropertyValue("--whisk-bg")).toBe("");
  });
});
