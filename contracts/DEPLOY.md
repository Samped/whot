# Deploy

1. Copy `.env.sample` to `.env` and put in a sepolia key with a bit of ETH.
2. `npx hardhat compile`
3. `npx hardhat run scripts/deployWhot.ts --network baseSepolia`
4. Paste the printed address into `frontend/.env` as `NEXT_PUBLIC_WHOT_ADDRESS`.

House key stays server side. Never prefix it with `NEXT_PUBLIC_`.
