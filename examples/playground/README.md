# Whisk Playground

The QA + testnet surface for `@usewhisk/react`. Renders the
widget in one column, the live config panel in the other, and pipes
every state transition into a bottom event log. Five preset shapes
flip the form between the integrations Whisk is built for (open form,
checkout, donate, invoice link, payroll row).

If you're sweeping the testnet matrix before mainnet, this is the
surface that drives it. The full checklist lives in
[`TESTING.md`](./TESTING.md).

## Layout

```
src/app/
├── layout.tsx                 # Self-hosts Inter + Geist Mono via next/font;
│                              # imports `@usewhisk/react/styles.css`.
├── globals.css                # Playground chrome + control panel + log styles.
├── page.tsx                   # Server component. Page header + footer +
│                              # mounts <ClientGate />.
├── client-gate.tsx            # Dynamic-loaded boundary with ssr:false so
│                              # wagmi never runs server-side.
└── playground/
    ├── index.tsx              # Composition root. Holds the store; wires
    │                          # theme up to the providers and config down
    │                          # to the widget.
    ├── providers.tsx          # WhiskProvider with reactive theme.
    ├── store.ts               # Reducer + types + presets-aware initial state.
    ├── controls.tsx           # Left panel — presets, toggles, address book.
    ├── stage.tsx              # The <WhiskSend /> with the current config.
    ├── event-log.tsx          # Bottom strip — last 30 events with kind +
    │                          # timestamp.
    ├── presets.ts             # Five named preset shapes.
    └── address-book.ts        # Quick-pick recipient list.
```

## Run it

```bash
# from the repo root
pnpm install
pnpm --filter @usewhisk/core build   # one-time, for the workspace dep
cp examples/nextjs-basic/.env.example examples/nextjs-basic/.env.local
# paste a WalletConnect Cloud project ID
pnpm --filter @usewhisk/example-nextjs-basic dev
```

Open <http://localhost:3000>.

## Environment

| Var | Required | Effect |
| --- | --- | --- |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | optional | Unlocks WalletConnect in the connect modal. Without it, only injected wallets (MetaMask, Coinbase, Rabby) light up. |

## What's wired

- **All 19 testnets** in the chain picker, Solana Devnet included.
- **EVM wallets:** MetaMask, Coinbase Wallet, Rabby, any injected EIP-1193 provider. WalletConnect lights up with a project ID.
- **Live config panel:** theme · wordmark · lock amount / recipient / source / destination · address book quick-picks · JSON inspector for the current config object.
- **Five presets:** Open form, E-commerce checkout, Donate button, Invoice payment link, Payroll row. Picking one rewrites the entire form so you can flip through integration shapes in seconds.
- **Event log:** every `onStateChange / onSuccess / onError` event with a timestamp and kind chip. Newest at the top. `aria-live="polite"` for screen readers.

## QA workflow

1. Open the playground.
2. Open [`TESTING.md`](./TESTING.md) alongside.
3. Walk section by section. Use the address book quick-picks instead of typing the same address into eighteen chains.
4. Watch the event log instead of DevTools for state transitions.
5. Use the JSON inspector to confirm the live config matches what you intended before each test.

## Working on Whisk and the playground simultaneously

`next.config.ts` lists both Whisk packages in `transpilePackages`, so
the Next compiler reads them straight from source. Edit anything in
`packages/core/src/` or `packages/react/src/` and the dev server picks
it up on save — no rebuild step.

## Getting testnet USDC

Faucet: <https://faucet.circle.com>. Most chains also need native gas
for the source-chain transaction — check each chain's own faucet.
