# WHOT

African matching cards. Play the computer instantly, or host a table and send the number to a friend. Friend-match hands are encrypted on-chain with [Inco Lightning](https://docs.inco.org) until a card is played.

Inco is **TEE-based**. Each hand stays sealed until that card is dumped. Settlement attests the catalog index of the card played.

## Play

1. Open [https://whatcards.vercel.app/](https://whatcards.vercel.app/)
2. **Play the computer** — no wallet
3. **Host a table** — copy the code or `/?t=2Z7AE6` and send it, or invite from Ranked
4. Friend sits, pack shuffles, hands stay sealed
5. Ranked board records wins from friend matches and computer games

Specials: 1 Hold on · 2 Pick two · 5 Pick three · 8 Suspension · 14 General market · 20 WHOT (call a shape)

When the market runs out, the ranks on every remaining card are added up — **lowest total wins**. Equal totals are a tie.

Tap your email / account chip for the **dashboard** (nickname, avatar, wins/losses, invites). Link an email there so ranked invites can also land in your inbox (needs `RESEND_API_KEY`).

The house wallet tops up new table accounts. Set `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` (Coinbase secret API key, not the public project id) so it auto-refills from the Base Sepolia faucet when low.

## Layout

```
├── contracts/          # Hardhat — Whot.sol + WhotSocial.sol
└── frontend/           # Next.js + RainbowKit + @inco/lightning-js
```

## Setup

```bash
npm install
cp frontend/.env.example frontend/.env
# set NEXT_PUBLIC_WHOT_ADDRESS, optional RESEND_API_KEY, and CDP_API_KEY_ID / CDP_API_KEY_SECRET to auto-refill the house

npm run dev
```

## Contracts

```bash
cp contracts/.env.sample contracts/.env

npm run contracts:compile
npm run contracts:test
npm run contracts:deploy:testnet
```

Paste the printed `Whot` address into `frontend/.env` as `NEXT_PUBLIC_WHOT_ADDRESS`, and the `Social` address as `NEXT_PUBLIC_SOCIAL_ADDRESS`.

## License

MIT. See `LICENSE`.
