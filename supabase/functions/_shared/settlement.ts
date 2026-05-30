import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from 'npm:@solana/web3.js@1.98.4';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync
} from 'npm:@solana/spl-token@0.4.14';

type SettlementInput = {
  challenge: Record<string, unknown>;
  claim: Record<string, unknown>;
};

export async function settleClaimWithRelayer({ challenge, claim }: SettlementInput) {
  const rpcUrl = Deno.env.get('SOLANA_RPC_URL');
  const programIdRaw = Deno.env.get('BOT_BOUNTY_PROGRAM_ID');
  const relayerSecretRaw = Deno.env.get('BOT_BOUNTY_RELAYER_SECRET_KEY');
  if (!rpcUrl || !programIdRaw || !relayerSecretRaw) {
    throw new Error('Solana settlement env is missing.');
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const relayer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(relayerSecretRaw)));
  const programId = new PublicKey(programIdRaw);
  const mint = new PublicKey(String(challenge.usdc_mint));
  const winnerWallet = new PublicKey(String(claim.wallet_address));
  const challengePda = challenge.solana_challenge_pda
    ? new PublicKey(String(challenge.solana_challenge_pda))
    : PublicKey.findProgramAddressSync(
      [new TextEncoder().encode('challenge'), new TextEncoder().encode(String(challenge.id))],
      programId
    )[0];
  const vaultAuthority = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('vault-authority'), challengePda.toBuffer()],
    programId
  )[0];
  const vault = challenge.solana_vault_address
    ? new PublicKey(String(challenge.solana_vault_address))
    : getAssociatedTokenAddressSync(mint, vaultAuthority, true);
  const claimPda = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('claim'), challengePda.toBuffer(), winnerWallet.toBuffer()],
    programId
  )[0];
  const winnerToken = getAssociatedTokenAddressSync(mint, winnerWallet);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: relayer.publicKey, isSigner: true, isWritable: true },
      { pubkey: challengePda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: claimPda, isSigner: false, isWritable: true },
      { pubkey: winnerWallet, isSigner: false, isWritable: false },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: winnerToken, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data: await anchorInstructionDiscriminator('settle_claim')
  });

  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, [relayer], {
    commitment: 'confirmed',
    skipPreflight: false
  });
}

async function anchorInstructionDiscriminator(name: string) {
  const encoded = new TextEncoder().encode(`global:${name}`);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return new Uint8Array(hash).slice(0, 8);
}
