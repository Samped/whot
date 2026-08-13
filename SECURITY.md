# Secrets

Do not commit:

- `HOUSE_PRIVATE_KEY`
- `HOUSE_RPC_URL`
- `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` / `CDP_WALLET_SECRET`
- wallet private keys
- Alchemy or other RPC keys

Those live in `.env`, which git ignores. Samples are empty on purpose.
