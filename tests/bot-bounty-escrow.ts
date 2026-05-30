import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo
} from '@solana/spl-token';
import { assert } from 'chai';

describe('bot-bounty-escrow', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.BotBountyEscrow as Program;

  const authority = provider.wallet as anchor.Wallet;
  const settlementAuthority = anchor.web3.Keypair.generate();
  const winnerWallet = anchor.web3.Keypair.generate();
  let mint: anchor.web3.PublicKey;
  let sponsorToken: anchor.web3.PublicKey;
  let challenge: anchor.web3.PublicKey;
  let vaultAuthority: anchor.web3.PublicKey;
  let vault: anchor.web3.PublicKey;

  const challengeId = 'defeat-tiger-bot';
  const season = 'season-1';
  const prizeAmount = new anchor.BN(2_000_000);
  const maxClaims = 2;

  before(async () => {
    await provider.connection.requestAirdrop(settlementAuthority.publicKey, anchor.web3.LAMPORTS_PER_SOL);
    mint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );
    sponsorToken = getAssociatedTokenAddressSync(mint, authority.publicKey);
    await mintTo(provider.connection, authority.payer, mint, sponsorToken, authority.publicKey, 10_000_000);
    [challenge] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('challenge'), Buffer.from(challengeId)],
      program.programId
    );
    [vaultAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('vault-authority'), challenge.toBuffer()],
      program.programId
    );
    vault = getAssociatedTokenAddressSync(mint, vaultAuthority, true);
  });

  it('initializes and funds a sponsored challenge vault', async () => {
    await program.methods
      .initializeChallenge(challengeId, season, prizeAmount, maxClaims, new anchor.BN(0))
      .accounts({
        authority: authority.publicKey,
        settlementAuthority: settlementAuthority.publicKey,
        usdcMint: mint,
        challenge,
        vaultAuthority,
        vault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY
      })
      .rpc();

    await program.methods
      .fundChallenge(new anchor.BN(4_000_000))
      .accounts({
        sponsor: authority.publicKey,
        challenge,
        usdcMint: mint,
        sponsorTokenAccount: sponsorToken,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID
      })
      .rpc();

    const vaultAccount = await getAccount(provider.connection, vault);
    assert.equal(vaultAccount.amount.toString(), '4000000');
  });

  it('settles one valid claim to the winner wallet', async () => {
    const winnerToken = getAssociatedTokenAddressSync(mint, winnerWallet.publicKey);
    const [claim] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('claim'), challenge.toBuffer(), winnerWallet.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .settleClaim()
      .accounts({
        settlementAuthority: settlementAuthority.publicKey,
        challenge,
        usdcMint: mint,
        claim,
        winnerWallet: winnerWallet.publicKey,
        vaultAuthority,
        vault,
        winnerTokenAccount: winnerToken,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
      })
      .signers([settlementAuthority])
      .rpc();

    const winnerAccount = await getAccount(provider.connection, winnerToken);
    assert.equal(winnerAccount.amount.toString(), '2000000');
  });

  it('rejects double claims for the same challenge and wallet', async () => {
    const winnerToken = getAssociatedTokenAddressSync(mint, winnerWallet.publicKey);
    const [claim] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('claim'), challenge.toBuffer(), winnerWallet.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .settleClaim()
        .accounts({
          settlementAuthority: settlementAuthority.publicKey,
          challenge,
          usdcMint: mint,
          claim,
          winnerWallet: winnerWallet.publicKey,
          vaultAuthority,
          vault,
          winnerTokenAccount: winnerToken,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
        })
        .signers([settlementAuthority])
        .rpc();
      assert.fail('Expected double claim to fail');
    } catch (err) {
      assert.include(String(err), 'already in use');
    }
  });
});
