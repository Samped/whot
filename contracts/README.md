# WHOT contracts

Hardhat project targeting **Inco Lightning** on Base Sepolia (or a local anvil + covalidator).

## Contracts

- `Whot.sol` — numbered tables, encrypted hands, ranked wins
- `WhotCards.sol` — 54-card Nigerian pack

## Commands

```bash
cp .env.sample .env
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deployWhot.ts --network baseSepolia
```

Then set `NEXT_PUBLIC_WHOT_ADDRESS` in `frontend/.env`.
