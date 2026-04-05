# Lightning & Tipping

folklore uses **Bitcoin Lightning** for tips and in-game payments. Lightning is a fast, low-fee payment network built on Bitcoin. Payments settle instantly and cost fractions of a cent.

---

## Tipping world authors

Every world can have a tip address — a Lightning Address or LNURL set by the author. When you click **tip** on a world, folklore generates a Lightning invoice. Your Lightning app pays it instantly.

Tips go directly to the world author. No intermediary. No platform fee.

---

## Getting a Lightning app

To send or receive tips, you need a Lightning app. Here are some options:

- **[Glow](https://glow-app.co)** - Browser, PWA
- **[Phoenix](https://phoenix.acinq.co)** - Android, iOS
- **[Wallet of Satoshi](https://www.walletofsatoshi.com/)** - Android, iOS
- **[Alby](https://getalby.com)** - Browser

Any Lightning app works — folklore uses standard Lightning invoices.

---

## In-game payments

World authors can gate content behind Lightning payments using **payment events** — A tavern keeper who charges for information, a toll bridge, a locked chest.

When a payment event triggers, folklore generates an invoice. You scan or pay with your Lightning app. On confirmation, the in-game action fires — a door opens, an item appears, a secret is revealed.

See the [Payments tutorial](/guide/10-payments) for how to build payment-gated content.

---

## For world authors

To receive tips, set a Lightning Address in your NOSTR profile (the `lud16` field in your kind:0 profile event). folklore reads this from your profile and shows the **tip** button on your world's card and in the game header.

Most Lightning apps provide a Lightning Address when you create an account (e.g. `yourname@walletprovider.com`). You can set it in your NOSTR profile using folklore's profile editor or any NOSTR client.

For in-game payments (toll gates, paywalled content), create a **payment event** with an LNURL and amount. See the [Payments tutorial](/guide/10-payments) for details.

---

## How it works (technical)

1. Player triggers a tip or payment
2. folklore resolves the LNURL (LUD-01/LUD-06) to get a payment endpoint
3. The endpoint generates a Lightning invoice for the requested amount
4. Player pays the invoice with their Lightning app
5. For in-game payments, folklore verifies payment via LUD-11 and fires the on-complete action
