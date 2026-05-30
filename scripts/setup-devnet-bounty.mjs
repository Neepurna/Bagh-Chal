import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync
} from '@solana/spl-token';

const PROGRAM_ID = new PublicKey(process.env.BOT_BOUNTY_PROGRAM_ID || '4gMywWMtcipYgq57W5w3egsHNXSMYrAbg29c79QLwKf6');
const USDC_MINT = new PublicKey(process.env.USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
const DEFAULT_RPC_URLS = {
  devnet: 'https://api.devnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com'
};
const RPC_URL = process.env.SOLANA_RPC_URL || DEFAULT_RPC_URLS[SOLANA_CLUSTER] || SOLANA_CLUSTER;
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR || `${process.env.HOME}/.config/solana/id.json`;
const SEASON = process.env.BOT_BOUNTY_SEASON || 'season-1';
const MAX_CLAIMS = Number(process.env.BOT_BOUNTY_MAX_CLAIMS || 1);
const FUND_USDC = process.env.BOT_BOUNTY_FUND_USDC ? Number(process.env.BOT_BOUNTY_FUND_USDC) : null;
const EXPIRES_AT = BigInt(process.env.BOT_BOUNTY_EXPIRES_AT || 0);
const CHALLENGE_FILTER = (process.env.BOT_BOUNTY_CHALLENGES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const SKIP_DB_UPDATE = process.env.SKIP_DB_UPDATE === '1';

if (SOLANA_CLUSTER === 'mainnet-beta' && process.env.ALLOW_MAINNET_SETUP !== '1') {
  throw new Error('Refusing mainnet setup without ALLOW_MAINNET_SETUP=1');
}

const ALL_CHALLENGES = [
  {
    id: 'defeat-tiger-bot',
    prizeUsdc: Number(process.env.DEFEAT_TIGER_BOT_PRIZE_USDC || 4)
  },
  {
    id: 'defeat-goat-bot',
    prizeUsdc: Number(process.env.DEFEAT_GOAT_BOT_PRIZE_USDC || 2)
  }
];
const CHALLENGES = CHALLENGE_FILTER.length
  ? ALL_CHALLENGES.filter((challenge) => CHALLENGE_FILTER.includes(challenge.id))
  : ALL_CHALLENGES;

const connection = new Connection(RPC_URL, 'confirmed');
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(execFileSync('bash', ['-lc', `cat "${KEYPAIR_PATH}"`], { encoding: 'utf8' }))));

function discriminator(name) {
  return crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

function writeString(value) {
  const bytes = Buffer.from(value, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

function writeU64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function writeI64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(BigInt(value));
  return buffer;
}

function writeU32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(Number(value));
  return buffer;
}

function amountToBaseUnits(amount) {
  return BigInt(Math.round(amount * 1_000_000));
}

async function accountExists(address) {
  return Boolean(await connection.getAccountInfo(address));
}

async function sendIfNeeded(ixs, label) {
  if (!ixs.length) return null;
  const tx = new Transaction().add(...ixs);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'confirmed' });
  console.log(`${label}: ${sig}`);
  return sig;
}

async function initializeChallenge({ id: challengeId, prizeUsdc }) {
  const [challenge] = PublicKey.findProgramAddressSync(
    [Buffer.from('challenge'), Buffer.from(challengeId)],
    PROGRAM_ID
  );
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault-authority'), challenge.toBuffer()],
    PROGRAM_ID
  );
  const vault = getAssociatedTokenAddressSync(USDC_MINT, vaultAuthority, true);

  if (!(await accountExists(challenge))) {
    const data = Buffer.concat([
      discriminator('initialize_challenge'),
      writeString(challengeId),
      writeString(SEASON),
      writeU64(amountToBaseUnits(prizeUsdc)),
      writeU32(MAX_CLAIMS),
      writeI64(EXPIRES_AT)
    ]);

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: payer.publicKey, isSigner: false, isWritable: false },
        { pubkey: USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: challenge, isSigner: false, isWritable: true },
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
      ],
      data
    });
    await sendIfNeeded([ix], `initialized ${challengeId}`);
  } else {
    console.log(`${challengeId}: challenge account already exists`);
    await updateChallengeTerms({ challengeId, prizeUsdc, challenge });
  }

  return { challengeId, prizeUsdc, challenge, vaultAuthority, vault };
}

async function updateChallengeTerms({ challengeId, prizeUsdc, challenge }) {
  const data = Buffer.concat([
    discriminator('update_challenge_terms'),
    writeU64(amountToBaseUnits(prizeUsdc)),
    writeU32(MAX_CLAIMS),
    writeI64(EXPIRES_AT)
  ]);
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: challenge, isSigner: false, isWritable: true }
    ],
    data
  });
  await sendIfNeeded([ix], `updated terms for ${challengeId}`);
}

async function fundChallenge({ challengeId, prizeUsdc, challenge, vault }) {
  const sponsorToken = getAssociatedTokenAddressSync(USDC_MINT, payer.publicKey);
  const ixs = [];
  if (!(await accountExists(sponsorToken))) {
    ixs.push(createAssociatedTokenAccountInstruction(
      payer.publicKey,
      sponsorToken,
      payer.publicKey,
      USDC_MINT
    ));
  }
  await sendIfNeeded(ixs, 'created sponsor USDC ATA');

  let sponsorBalance = 0n;
  try {
    sponsorBalance = (await getAccount(connection, sponsorToken)).amount;
  } catch {
    sponsorBalance = 0n;
  }

  let vaultBalance = 0n;
  try {
    vaultBalance = (await getAccount(connection, vault)).amount;
  } catch {
    vaultBalance = 0n;
  }

  const desired = amountToBaseUnits(FUND_USDC ?? prizeUsdc * MAX_CLAIMS);
  const required = desired > vaultBalance ? desired - vaultBalance : 0n;
  if (required === 0n) {
    console.log(`${challengeId}: funding skipped, vault already has ${Number(vaultBalance) / 1_000_000} USDC`);
    return false;
  }
  if (sponsorBalance < required) {
    console.log(`${challengeId}: funding skipped, sponsor has ${Number(sponsorBalance) / 1_000_000} USDC, needs ${Number(required) / 1_000_000} USDC`);
    return false;
  }

  const data = Buffer.concat([
    discriminator('fund_challenge'),
    writeU64(required)
  ]);
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: challenge, isSigner: false, isWritable: false },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: sponsorToken, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data
  });
  await sendIfNeeded([ix], `funded ${challengeId}`);
  return true;
}

function updateLocalDatabase(rows) {
  const values = rows.map(({ challengeId, prizeUsdc, challenge, vault }) =>
    `('${challengeId}', ${prizeUsdc}, ${MAX_CLAIMS}, '${challenge.toBase58()}', '${vault.toBase58()}')`
  ).join(',');

  const sql = `
    update public.bot_challenges as c
    set
      solana_cluster = '${SOLANA_CLUSTER}',
      usdc_mint = '${USDC_MINT.toBase58()}',
      prize_usdc = v.prize_usdc,
      max_claims = v.max_claims,
      solana_challenge_pda = v.challenge_pda,
      solana_vault_address = v.vault_address,
      updated_at = now()
    from (values ${values}) as v(id, prize_usdc, max_claims, challenge_pda, vault_address)
    where c.id = v.id;
  `;
  execFileSync('psql', ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    stdio: 'inherit'
  });
}

const rows = [];
for (const challenge of CHALLENGES) {
  const row = await initializeChallenge(challenge);
  await fundChallenge(row);
  rows.push(row);
}

if (!SKIP_DB_UPDATE) {
  updateLocalDatabase(rows);
}

console.log(`\n${SOLANA_CLUSTER} challenge setup:`);
for (const row of rows) {
  console.log(`${row.challengeId}`);
  console.log(`  prize:         ${row.prizeUsdc} USDC`);
  console.log(`  challenge PDA: ${row.challenge.toBase58()}`);
  console.log(`  vault:         ${row.vault.toBase58()}`);
}
console.log(`  program id:    ${PROGRAM_ID.toBase58()}`);
console.log(`  USDC mint:     ${USDC_MINT.toBase58()}`);
