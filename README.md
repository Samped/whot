# WHOT

African matching cards. Play the computer instantly, or host a table and send the number to a friend. Friend-match hands are encrypted on-chain with [Inco Lightning](https://docs.inco.org) until a card is played.

Inco is **TEE-based**. Each hand stays sealed until that card is dumped. Settlement attests the catalog index of the card played.

## Play

1. Open [http://localhost:3000](http://localhost:3000)
2. **Play the computer** — no wallet
3. **Host a table** — copy the number or `/?t=0007` and send it
4. Friend sits, pack shuffles, hands stay sealed
5. Ranked board records friend-match wins

Specials: 1 Hold on · 2 Pick two · 5 Pick three · 8 Suspension · 14 General market · 20 WHOT (call a shape)

## Layout

```
├── contracts/          # Hardhat — Whot.sol + WhotCards.sol
└── frontend/           # Next.js + RainbowKit + @inco/lightning-js
```

## Setup

```bash
npm install
cp frontend/.env.example frontend/.env
# set NEXT_PUBLIC_WHOT_ADDRESS after deploy

npm run dev
```

## Contracts

```bash
cp contracts/.env.sample contracts/.env

npm run contracts:compile
npm run contracts:test
npm run contracts:deploy:testnet
```

Paste the printed address into `frontend/.env` as `NEXT_PUBLIC_WHOT_ADDRESS`.

## License

MIT. See `LICENSE`.
