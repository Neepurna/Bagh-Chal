# Mainnet Bot Bounty Test Runbook

This runbook is the launch checklist for the first public Bot Bounty test run:

- Defeat Goat Bot: 2 USDC prize, first verified winner only.
- Defeat Tiger Bot: 4 USDC prize, first verified winner only.
- No entry fee.
- One payout per wallet per boss per season.
- Daily attempt cap stays enabled.
- Sponsored prize vault pays the winner through the backend relayer.

Do not run mainnet transaction commands until the dry-run checks pass and the launch wallet, compliance notes, and hosted backend are confirmed.

## 1. Confirm Constants

Use these values for the test run.

```sh
SOLANA_CLUSTER=mainnet-beta
MAINNET_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
DEFEAT_GOAT_BOT_PRIZE_USDC=2
DEFEAT_TIGER_BOT_PRIZE_USDC=4
BOT_BOUNTY_MAX_CLAIMS=1
BOT_BOUNTY_SEASON=test-run-1
```

Current devnet program used during rehearsal:

```sh
DEVNET_PROGRAM_ID=4gMywWMtcipYgq57W5w3egsHNXSMYrAbg29c79QLwKf6
DEVNET_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

For mainnet, deploy the escrow program to mainnet and use the mainnet program id in all hosted secrets and frontend config.

## 2. Preflight Checks

Run these locally before any mainnet deploy.

```sh
npm run build
NO_DNA=1 anchor build --no-idl
```

Expected result:

- Frontend build completes.
- Anchor build completes.
- No uncommitted accidental config changes to production secrets.

Check Solana CLI target and wallet.

```sh
solana config get
solana address
solana balance --url devnet
solana balance --url mainnet-beta
```

Expected result:

- Devnet commands use devnet.
- Mainnet commands use an intentional launch authority wallet.
- Mainnet authority wallet has enough SOL for deploy and transaction fees.

## 3. Devnet Rehearsal

The devnet flow must pass before mainnet.

```sh
solana config set --url devnet
npm run bounty:setup:devnet
```

Then verify the two challenge vaults.

```sh
node scripts/bounty-ops.mjs check
```

Expected result:

- Defeat Goat Bot shows prize 2 USDC and max claims 1.
- Defeat Tiger Bot shows prize 4 USDC and max claims 1.
- Vault balances are funded enough for one payout each.
- A real browser claim can move from pending to approved.

If local Supabase is offline, start Docker Desktop and Supabase first.

```sh
supabase start --workdir .
supabase status --workdir .
```

## 4. Mainnet Program Deploy

Stop here and confirm the deploy wallet before running this section.

Set Solana to mainnet.

```sh
solana config set --url mainnet-beta
solana address
solana balance --url mainnet-beta
```

Build the escrow program.

```sh
NO_DNA=1 anchor build --no-idl
```

Deploy the mainnet program.

```sh
solana program deploy --use-rpc --url mainnet-beta target/deploy/bot_bounty_escrow.so
```

Save the returned program id as:

```sh
MAINNET_BOT_BOUNTY_PROGRAM_ID=<returned-program-id>
```

Verify it.

```sh
solana program show --url mainnet-beta "$MAINNET_BOT_BOUNTY_PROGRAM_ID"
```

Expected result:

- Program is executable.
- Program upgrade authority is the intended launch authority.
- Program id is copied into hosted backend and frontend config.

## 5. Hosted Supabase Setup

Apply the migration to the hosted Supabase project.

```sh
supabase db push
```

Confirm or patch the test-run challenge rows.

```sql
update public.bot_challenges
set prize_usdc = case id
  when 'defeat-goat-bot' then 2
  when 'defeat-tiger-bot' then 4
end,
max_claims = 1,
status = 'active',
updated_at = now()
where id in ('defeat-goat-bot', 'defeat-tiger-bot');
```

Deploy Edge Functions.

```sh
supabase functions deploy wallet-nonce
supabase functions deploy wallet-link
supabase functions deploy challenge-start
supabase functions deploy challenge-move
supabase functions deploy challenge-submit-result
supabase functions deploy challenge-claim
supabase functions deploy challenge-resign
```

Set hosted function secrets.

```sh
supabase secrets set SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
supabase secrets set BOT_BOUNTY_PROGRAM_ID="$MAINNET_BOT_BOUNTY_PROGRAM_ID"
supabase secrets set BOT_BOUNTY_RELAYER_SECRET_KEY='<mainnet-relayer-secret-key-json-array>'
supabase secrets set CHALLENGE_SETTLEMENT_ENABLED=true

# Optional tuning (recommended to set explicitly so bot behavior matches promotion).
supabase secrets set CHALLENGE_BOT_DIFFICULTY=hard
supabase secrets set CHALLENGE_BOT_DELAY_MS=50
```

Expected result:

- Hosted functions can read challenge rows.
- Relayer wallet is mainnet only.
- Relayer wallet key is never committed to the repo.

## 6. Mainnet Challenge Initialization And Funding

Stop here and confirm the USDC amount before running this section.

Fund only the test-run amount:

- 2 USDC for Defeat Goat Bot.
- 4 USDC for Defeat Tiger Bot.
- Small SOL balance for relayer fees.

Run the setup script with mainnet-specific environment variables. The script refuses mainnet unless `ALLOW_MAINNET_SETUP=1` is present.

```sh
ALLOW_MAINNET_SETUP=1 \
SOLANA_CLUSTER=mainnet-beta \
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com \
USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
BOT_BOUNTY_PROGRAM_ID="$MAINNET_BOT_BOUNTY_PROGRAM_ID" \
BOT_BOUNTY_SEASON=test-run-1 \
DEFEAT_GOAT_BOT_PRIZE_USDC=2 \
DEFEAT_TIGER_BOT_PRIZE_USDC=4 \
BOT_BOUNTY_MAX_CLAIMS=1 \
SKIP_DB_UPDATE=1 \
node scripts/setup-devnet-bounty.mjs
```

Expected result:

- Both Challenge PDAs exist.
- Goat vault has exactly 2 USDC available.
- Tiger vault has exactly 4 USDC available.
- `max_claims` is 1 for both.

Before public launch, run one internal capped mainnet dry run with a private challenge or a paused public challenge. Do not consume the public one-prize challenge unless that is intentional.

## 7. Frontend Deploy

Set production frontend env (Vercel environment variables or the host you use).

```sh
VITE_SOLANA_CLUSTER=mainnet-beta
VITE_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
VITE_BOT_BOUNTY_SEASON=test-run-1
VITE_DEFEAT_GOAT_BOT_PRIZE_USDC=2
VITE_DEFEAT_TIGER_BOT_PRIZE_USDC=4
VITE_BOT_BOUNTY_MAX_CLAIMS=1
VITE_SUPABASE_FUNCTION_REGION=ap-southeast-2
```

Deploy the app.

```sh
npm run build
```

Then deploy through the hosting provider.

Expected result:

- Bot Bounty screen says this is a test run.
- Goat card shows 2 USDC.
- Tiger card shows 4 USDC.
- A user can sign in, link Phantom, start a challenge, and play without a timer.
- Claim button only appears after a server-verified win.

## 8. Launch Gate

Do not promote until these are true.

- Official rules are published.
- Prize cap is visible: one 2 USDC Goat prize and one 4 USDC Tiger prize.
- Eligibility limits are visible.
- Wallet-risk notice is visible.
- Tax disclaimer is visible.
- Unsupported jurisdictions are blocked or clearly excluded.
- Sanctions/compliance screening decision is documented.
- Support contact is visible.
- Emergency pause path is tested.

## 9. Live Monitoring

During launch, watch these tables:

```sql
select * from public.bot_challenge_attempts order by created_at desc limit 20;
select * from public.bot_challenge_claims order by created_at desc limit 20;
select * from public.chain_events order by created_at desc limit 20;
```

Watch the vaults and relayer wallet:

```sh
spl-token balance <goat-vault-token-account> --url mainnet-beta
spl-token balance <tiger-vault-token-account> --url mainnet-beta
solana balance <relayer-wallet> --url mainnet-beta
```

Expected result:

- First valid winner for each boss receives the prize.
- Second claim for the same boss is rejected after `max_claims = 1`.
- Claims never approve for losses, draws, resignations, timeouts, or tampered games.

## 10. Emergency Pause

If anything looks wrong, pause claims first.

```sql
update public.bot_challenges
set status = 'paused', updated_at = now()
where id in ('defeat-goat-bot', 'defeat-tiger-bot');
```

If the on-chain challenge must be paused, use the authority wallet and the pause instruction.

Immediate containment checklist:

- Pause both challenge rows.
- Remove or rotate relayer secret if it may be exposed.
- Disable claim function or unset settlement secrets.
- Keep the site online only if it clearly shows claims are paused.
- Export attempts, moves, claims, and chain events before debugging.

## 11. Post-Launch Closeout

After both prizes are claimed or the test ends:

- Export all attempt and claim rows.
- Verify each payout transaction on Solana Explorer.
- Publish a short winner and tx summary if allowed by the rules.
- Withdraw expired unused funds only after the published claim window ends.
- Write down bugs, abuse signals, and support issues before expanding to larger prizes.
