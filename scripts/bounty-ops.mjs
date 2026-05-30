import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';

const PROGRAM_ID = new PublicKey(process.env.BOT_BOUNTY_PROGRAM_ID || '4gMywWMtcipYgq57W5w3egsHNXSMYrAbg29c79QLwKf6');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR || `${process.env.HOME}/.config/solana/id.json`;
const DB_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const USDC_DECIMALS = 6;

const command = process.argv[2] || 'check';
const challengeId = process.argv[3] || null;

const connection = new Connection(RPC_URL, 'confirmed');

function usage() {
  console.log(`Usage:
  node scripts/bounty-ops.mjs check
  node scripts/bounty-ops.mjs pause <challenge-id>
  node scripts/bounty-ops.mjs unpause <challenge-id>

Env:
  SOLANA_RPC_URL              default https://api.devnet.solana.com
  BOT_BOUNTY_PROGRAM_ID       default deployed devnet program
  SOLANA_KEYPAIR              default ~/.config/solana/id.json
  SUPABASE_DB_URL             default local Supabase Postgres
`);
}

function discriminator(name) {
  return crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

function readKeypair() {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(
    execFileSync('bash', ['-lc', `cat "${KEYPAIR_PATH}"`], { encoding: 'utf8' })
  )));
}

function psqlJson(sql) {
  const output = execFileSync('psql', [
    DB_URL,
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
    '-c',
    `select coalesce(json_agg(row_to_json(q)), '[]'::json) from (${sql}) q;`
  ], { encoding: 'utf8' }).trim();
  return JSON.parse(output || '[]');
}

function psqlExec(sql) {
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'inherit' });
}

async function getVaultBalance(address) {
  if (!address) return null;
  try {
    const account = await getAccount(connection, new PublicKey(address));
    return Number(account.amount) / 10 ** USDC_DECIMALS;
  } catch {
    return null;
  }
}

async function getProgramStatus() {
  const info = await connection.getAccountInfo(PROGRAM_ID);
  if (!info) return 'not found';
  return `deployed, owner ${info.owner.toBase58()}, executable ${info.executable ? 'yes' : 'no'}`;
}

async function check() {
  const rows = psqlJson(`
    select
      id,
      status,
      prize_usdc,
      max_claims,
      claims_paid,
      solana_cluster,
      usdc_mint,
      solana_challenge_pda,
      solana_vault_address
    from public.bot_challenges
    order by id
  `);
  const programStatus = await getProgramStatus();

  console.log(`Program: ${PROGRAM_ID.toBase58()} (${programStatus})`);
  console.log(`RPC: ${RPC_URL}`);
  console.log('');

  for (const row of rows) {
    const vaultBalance = await getVaultBalance(row.solana_vault_address);
    const prize = Number(row.prize_usdc || 0);
    const fundedClaims = vaultBalance === null || prize <= 0 ? 0 : Math.floor(vaultBalance / prize);
    const dbClaimsLeft = Math.max(0, Number(row.max_claims || 0) - Number(row.claims_paid || 0));
    const payoutReady = row.status === 'active' && fundedClaims > 0;

    console.log(row.id);
    console.log(`  db status:       ${row.status}`);
    console.log(`  prize:           ${prize} USDC`);
    console.log(`  db claims left:  ${dbClaimsLeft}`);
    console.log(`  vault balance:   ${vaultBalance === null ? 'missing' : `${vaultBalance} USDC`}`);
    console.log(`  funded claims:   ${fundedClaims}`);
    console.log(`  payout ready:    ${payoutReady ? 'yes' : 'no'}`);
    console.log(`  challenge PDA:   ${row.solana_challenge_pda || 'missing'}`);
    console.log(`  vault:           ${row.solana_vault_address || 'missing'}`);
    console.log(`  mint:            ${row.usdc_mint}`);
    console.log('');
  }
}

function requireChallengeId() {
  if (!challengeId) {
    usage();
    process.exit(1);
  }
}

async function setPause(paused) {
  requireChallengeId();
  const rows = psqlJson(`
    select id, solana_challenge_pda
    from public.bot_challenges
    where id = '${challengeId.replaceAll("'", "''")}'
    limit 1
  `);
  const row = rows[0];
  if (!row?.solana_challenge_pda) {
    throw new Error(`Challenge ${challengeId} does not have a solana_challenge_pda in local DB.`);
  }

  const payer = readKeypair();
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: new PublicKey(row.solana_challenge_pda), isSigner: false, isWritable: true }
    ],
    data: Buffer.concat([discriminator('pause_challenge'), Buffer.from([paused ? 1 : 0])])
  });

  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer], {
    commitment: 'confirmed'
  });

  psqlExec(`
    update public.bot_challenges
    set status = '${paused ? 'paused' : 'active'}', updated_at = now()
    where id = '${challengeId.replaceAll("'", "''")}';
  `);

  console.log(`${paused ? 'Paused' : 'Unpaused'} ${challengeId}`);
  console.log(`tx: ${signature}`);
}

if (command === 'check') {
  await check();
} else if (command === 'pause') {
  await setPause(true);
} else if (command === 'unpause') {
  await setPause(false);
} else {
  usage();
  process.exit(1);
}
