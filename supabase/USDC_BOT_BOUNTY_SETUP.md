# USDC Bot Bounty Setup

This MVP is free-to-enter and sponsor-funded. Do not enable mainnet settlement until the program, relayer, rules, and compliance gates are reviewed.

## Frontend Env

```bash
VITE_SOLANA_CLUSTER=mainnet-beta
VITE_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
VITE_BOT_BOUNTY_SEASON=season-1
VITE_DEFEAT_GOAT_BOT_PRIZE_USDC=2
VITE_DEFEAT_TIGER_BOT_PRIZE_USDC=4
VITE_BOT_BOUNTY_MAX_CLAIMS=1
```

## Supabase Edge Function Env

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CHALLENGE_SETTLEMENT_ENABLED=false
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
BOT_BOUNTY_PROGRAM_ID=...
BOT_BOUNTY_RELAYER_SECRET_KEY=[...]
```

`CHALLENGE_SETTLEMENT_ENABLED=false` records approved claims without sending USDC. Only set it to `true` after the Anchor program is deployed, the sponsored vault is funded, and the relayer key has been limited and reviewed.

## Deploy Order

1. Apply `supabase/schema.sql`.
2. Deploy functions: `wallet-nonce`, `wallet-link`, `challenge-start`, `challenge-move`, `challenge-submit-result`, `challenge-claim`.
3. Build and deploy the Anchor program.
4. Initialize both challenges on-chain and fund their USDC vaults.
5. Fill `solana_challenge_pda` and `solana_vault_address` in `bot_challenges`.
6. Run a capped internal mainnet dry run before public promotion.

## Devnet Ops

Initialize/update devnet challenge PDAs and vault addresses:

```bash
npm run bounty:setup:devnet
```

Fund each boss vault with the configured first-come, first-served prize amount:

```bash
npm run bounty:setup:devnet
```

Check program, DB status, vault balances, and funded claim capacity:

```bash
npm run bounty:check
```

Pause or unpause a boss on-chain and in local Supabase:

```bash
node scripts/bounty-ops.mjs pause defeat-goat-bot
node scripts/bounty-ops.mjs unpause defeat-goat-bot
```

Local settlement testing should run Edge Functions with an env file, not inline shell env:

```bash
supabase functions serve --workdir . --env-file /path/to/local-functions.env
```

Never commit `BOT_BOUNTY_RELAYER_SECRET_KEY` or a relayer keypair file.
