use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

declare_id!("4gMywWMtcipYgq57W5w3egsHNXSMYrAbg29c79QLwKf6");

#[program]
pub mod bot_bounty_escrow {
    use super::*;

    pub fn initialize_challenge(
        ctx: Context<InitializeChallenge>,
        challenge_id: String,
        season: String,
        prize_amount: u64,
        max_claims: u32,
        expires_at: i64,
    ) -> Result<()> {
        require!(!challenge_id.is_empty() && challenge_id.len() <= 32, BountyError::InvalidChallengeId);
        require!(!season.is_empty() && season.len() <= 32, BountyError::InvalidSeason);
        require!(prize_amount > 0, BountyError::InvalidPrizeAmount);
        require!(max_claims > 0, BountyError::InvalidMaxClaims);

        let challenge = &mut ctx.accounts.challenge;
        challenge.authority = ctx.accounts.authority.key();
        challenge.settlement_authority = ctx.accounts.settlement_authority.key();
        challenge.usdc_mint = ctx.accounts.usdc_mint.key();
        challenge.vault = ctx.accounts.vault.key();
        challenge.challenge_id = challenge_id;
        challenge.season = season;
        challenge.prize_amount = prize_amount;
        challenge.max_claims = max_claims;
        challenge.claims_paid = 0;
        challenge.paused = false;
        challenge.expires_at = expires_at;
        challenge.challenge_bump = ctx.bumps.challenge;
        challenge.vault_authority_bump = ctx.bumps.vault_authority;
        Ok(())
    }

    pub fn fund_challenge(ctx: Context<FundChallenge>, amount: u64) -> Result<()> {
        require!(amount > 0, BountyError::InvalidFundingAmount);
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.sponsor_token_account.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.sponsor.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer_checked(cpi_ctx, amount, ctx.accounts.usdc_mint.decimals)
    }

    pub fn update_challenge_terms(
        ctx: Context<UpdateChallengeTerms>,
        prize_amount: u64,
        max_claims: u32,
        expires_at: i64,
    ) -> Result<()> {
        require!(prize_amount > 0, BountyError::InvalidPrizeAmount);
        require!(max_claims > 0, BountyError::InvalidMaxClaims);
        require!(max_claims >= ctx.accounts.challenge.claims_paid, BountyError::InvalidMaxClaims);

        let challenge = &mut ctx.accounts.challenge;
        challenge.prize_amount = prize_amount;
        challenge.max_claims = max_claims;
        challenge.expires_at = expires_at;
        Ok(())
    }

    pub fn pause_challenge(ctx: Context<PauseChallenge>, paused: bool) -> Result<()> {
        ctx.accounts.challenge.paused = paused;
        Ok(())
    }

    pub fn settle_claim(ctx: Context<SettleClaim>) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        require!(!challenge.paused, BountyError::ChallengePaused);
        require!(challenge.claims_paid < challenge.max_claims, BountyError::ClaimCapReached);
        require!(ctx.accounts.vault.amount >= challenge.prize_amount, BountyError::InsufficientVaultBalance);
        let now = Clock::get()?.unix_timestamp;
        require!(challenge.expires_at == 0 || now < challenge.expires_at, BountyError::ChallengeExpired);

        let claim = &mut ctx.accounts.claim;
        claim.challenge = challenge.key();
        claim.winner_wallet = ctx.accounts.winner_wallet.key();
        claim.amount = challenge.prize_amount;
        claim.settled_at = Clock::get()?.unix_timestamp;
        claim.bump = ctx.bumps.claim;

        challenge.claims_paid = challenge
            .claims_paid
            .checked_add(1)
            .ok_or(BountyError::MathOverflow)?;

        let challenge_key = challenge.key();
        let seeds: &[&[u8]] = &[
            b"vault-authority",
            challenge_key.as_ref(),
            &[challenge.vault_authority_bump],
        ];
        let signer = &[seeds];
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.winner_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token::transfer_checked(cpi_ctx, claim.amount, ctx.accounts.usdc_mint.decimals)
    }

    pub fn withdraw_expired_funds(ctx: Context<WithdrawExpiredFunds>) -> Result<()> {
        let challenge = &ctx.accounts.challenge;
        let now = Clock::get()?.unix_timestamp;
        require!(challenge.expires_at > 0 && now >= challenge.expires_at, BountyError::ChallengeNotExpired);
        let amount = ctx.accounts.vault.amount;
        require!(amount > 0, BountyError::InsufficientVaultBalance);

        let challenge_key = challenge.key();
        let seeds: &[&[u8]] = &[
            b"vault-authority",
            challenge_key.as_ref(),
            &[challenge.vault_authority_bump],
        ];
        let signer = &[seeds];
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.destination_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token::transfer_checked(cpi_ctx, amount, ctx.accounts.usdc_mint.decimals)
    }
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct InitializeChallenge<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Stored as the signer required for future server-authorized settlements.
    pub settlement_authority: UncheckedAccount<'info>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + Challenge::INIT_SPACE,
        seeds = [b"challenge", challenge_id.as_bytes()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,
    /// CHECK: PDA authority for the challenge vault.
    #[account(
        seeds = [b"vault-authority", challenge.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_authority
    )]
    pub vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct FundChallenge<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    #[account(has_one = usdc_mint, has_one = vault)]
    pub challenge: Account<'info, Challenge>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, constraint = sponsor_token_account.mint == challenge.usdc_mint)]
    pub sponsor_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = challenge.vault)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateChallengeTerms<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority)]
    pub challenge: Account<'info, Challenge>,
}

#[derive(Accounts)]
pub struct PauseChallenge<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority)]
    pub challenge: Account<'info, Challenge>,
}

#[derive(Accounts)]
pub struct SettleClaim<'info> {
    #[account(mut)]
    pub settlement_authority: Signer<'info>,
    #[account(
        mut,
        has_one = settlement_authority,
        has_one = usdc_mint,
        has_one = vault
    )]
    pub challenge: Account<'info, Challenge>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = settlement_authority,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", challenge.key().as_ref(), winner_wallet.key().as_ref()],
        bump
    )]
    pub claim: Account<'info, Claim>,
    /// CHECK: Winner wallet is the token-account authority and part of the claim PDA seed.
    pub winner_wallet: UncheckedAccount<'info>,
    /// CHECK: PDA authority for the challenge vault.
    #[account(
        seeds = [b"vault-authority", challenge.key().as_ref()],
        bump = challenge.vault_authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, address = challenge.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = settlement_authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = winner_wallet
    )]
    pub winner_token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct WithdrawExpiredFunds<'info> {
    pub authority: Signer<'info>,
    #[account(
        has_one = authority,
        has_one = usdc_mint,
        has_one = vault
    )]
    pub challenge: Account<'info, Challenge>,
    pub usdc_mint: Account<'info, Mint>,
    /// CHECK: PDA authority for the challenge vault.
    #[account(
        seeds = [b"vault-authority", challenge.key().as_ref()],
        bump = challenge.vault_authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, address = challenge.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = destination_token_account.mint == challenge.usdc_mint)]
    pub destination_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Challenge {
    pub authority: Pubkey,
    pub settlement_authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub vault: Pubkey,
    #[max_len(32)]
    pub challenge_id: String,
    #[max_len(32)]
    pub season: String,
    pub prize_amount: u64,
    pub max_claims: u32,
    pub claims_paid: u32,
    pub paused: bool,
    pub expires_at: i64,
    pub challenge_bump: u8,
    pub vault_authority_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Claim {
    pub challenge: Pubkey,
    pub winner_wallet: Pubkey,
    pub amount: u64,
    pub settled_at: i64,
    pub bump: u8,
}

#[error_code]
pub enum BountyError {
    #[msg("Challenge id must be 1-32 bytes.")]
    InvalidChallengeId,
    #[msg("Season must be 1-32 bytes.")]
    InvalidSeason,
    #[msg("Prize amount must be greater than zero.")]
    InvalidPrizeAmount,
    #[msg("Max claims must be greater than zero.")]
    InvalidMaxClaims,
    #[msg("Funding amount must be greater than zero.")]
    InvalidFundingAmount,
    #[msg("Challenge is paused.")]
    ChallengePaused,
    #[msg("Challenge claim cap has been reached.")]
    ClaimCapReached,
    #[msg("Challenge vault does not have enough USDC.")]
    InsufficientVaultBalance,
    #[msg("Challenge is not expired.")]
    ChallengeNotExpired,
    #[msg("Challenge has expired.")]
    ChallengeExpired,
    #[msg("Math overflow.")]
    MathOverflow,
}
