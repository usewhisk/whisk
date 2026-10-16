# ADR for Dummies: Whisk as a production stablecoin payments platform

- **Status:** Accepted by the maintainer on 2026-10-16, with changes
- **Date:** 2026-10-16

## The Idea

Whisk lets any app take dollar payments in USDC from a wallet on almost any blockchain,
and the money lands where the merchant wants it. Arc, Circle's own blockchain, is now
live, so it becomes Whisk's home chain. Whisk grows from a widget into a full product:

- a free sign-up for developers;
- a dashboard;
- paid plans for teams.

## What the Person Sees

**A developer:**

1. Signs up at the Whisk dashboard with email, Google, GitHub or a wallet.
2. Creates an app and gets an app ID. Test mode is free and instant.
3. Pastes a few lines into their site (React, React Native, plain HTML, or a no-code
   payment link) and sees a working payment form.
4. Adds their live domain, switches to live mode, and takes real payments. This is
   still free.
5. Watches payments arrive in the dashboard, gets a webhook when each one settles, and
   can recover any payment that got stuck.
6. When they bring teammates, they move to the Team plan and pay per seat.

**A payer:**

1. Sees an amount and a "Pay" button that looks like part of the merchant's site.
2. Pays from whatever they hold:
   - USDC on any of about 30 blockchains;
   - another token, which is swapped for them.
3. Sees every fee before they sign, and a progress trace while the money moves.
4. Gets a receipt link that also works as a recovery link if anything is interrupted.

**A business with no developers:** creates a payment link or hosted checkout page in
the dashboard and shares it.

**The Whisk owner:** signs in to a private admin console to see every customer, every
payment and the health of the whole system. From there they can pause a misbehaving
app or a blockchain having problems, help a customer recover a stuck payment, and
watch sign-ups and revenue.

**An investor or anyone curious:** opens a public stats page, with no sign-in, that
shows how much money moves through Whisk, on which chains, and how fast it grows. It
never names customers. The same numbers are on a public Dune dashboard, so nobody has
to take Whisk's word for them.

## Important Limitation

- **Whisk never holds anyone's money.** It moves USDC between the payer's and the
  merchant's own wallets using Circle's transfer system. That means Whisk cannot
  reverse a payment or freeze one.
- **The app ID controls Whisk's hosted services, not the open-source code.**
  - The hosted services are reliable delivery, the dashboard, webhooks and analytics.
  - Someone could copy the free code and run it without Whisk's services; the bet is
    that the hosted path is much better.
- **Paying by card or bank (onramp) is not in this plan.** It will be built later, once
  the owner decides how Whisk registers with Circle for it. Until then, payers need
  some crypto.
- **Cashing out to a bank (offramp)** waits for the provider the maintainer picks later.
- **Some chains have limits:**
  - Sui and Aptos come after launch.
  - BNB Chain cannot be supported, because Circle's transfer system does not carry USDC
    there.

## What Changes

**Chains and engine:**

- Arc becomes the default network, on both mainnet and testnet.
- Supported chains grow from 11 to about 30, plus Sui and Aptos later.

**What Whisk does:**

- Whisk does the payment-related things from Circle's App Kit: send, bridge, pay with
  any token, and later yield on a merchant's idle money.
- It deliberately does not do lending or borrowing, because that is a credit product,
  not payments.
- It leaves out "one balance across many chains". That feature makes a payer deposit
  first, which slows down a first payment. Its technology is looked at again only for
  payments made by AI agents, where it lets software pay tiny amounts per request.

**The platform:**

- A real backend and dashboard: teams, roles, keys, analytics, webhooks verified on the
  blockchain, and an audit log.
- A private admin console for the owner and a public stats page for investors.
- Everything lives on `usewhisk.xyz`: the website, plus `dashboard.`, `api.`, `pay.`,
  `docs.`, `admin.`, `stats.` and `status.` addresses.
- New ways to use Whisk: React Native apps, a drop-in tag for any website, hosted
  checkout pages, and a REST API for businesses.

**Pricing:**

- Free for individuals, about $29 per seat for teams, and a business plan from $499 for
  brands.
- Developers will be able to add their own fee to payments, and Whisk will later keep
  10% of it.

**Code, design and docs:**

- The code is split into several repositories in the `usewhisk` GitHub org.
- **Open core:** the part developers put in their apps stays open source, so anyone can
  check how it handles money. The part Whisk runs and charges for (the platform,
  dashboard, admin, stats and website) is private.
- A new light-only design for Whisk's own website, docs, dashboard, admin, stats and
  checkout. The widget merchants embed still offers light and dark, so it fits any site.
- Docs move to Mintlify, the same tool Circle and Arc use. It also lets AI coding
  assistants read Whisk's docs directly.
- Docs and examples are rewritten.

## What Does Not Change

- The open-source SDK stays MIT licensed and free, and its licence will never be
  changed.
- Whisk stays non-custodial: payers and merchants keep their own wallets.
- The existing chains (Ethereum, Base, Solana, Stellar, Starknet and the rest) keep
  working, and the engine already built in PR #57 becomes the foundation instead of
  being thrown away.
- The fund-safety rules stay:
  - nothing is sent before every check passes;
  - every payment can be recovered;
  - amounts are never rounded with floating-point maths.
- Every phase still goes through its own pair of decision documents and the
  maintainer's approval before it is built.
