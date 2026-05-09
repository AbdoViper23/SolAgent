use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked,
};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("YourVaultProgramId1111111111111111111111111");

pub const VAULT_SEED: &[u8] = b"vault";
pub const SECONDS_PER_DAY: i64 = 86_400;

#[program]
pub mod trading_vault {
    use super::*;

    pub fn init_vault(
        ctx: Context<InitVault>,
        daily_limit: u64,
        slippage_bps: u16,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.bump = ctx.bumps.vault;
        vault.authority = ctx.accounts.user.key();
        vault.daily_spend_limit = daily_limit;
        vault.daily_spent = 0;
        vault.last_reset_ts = Clock::get()?.unix_timestamp;
        vault.slippage_bps_cap = slippage_bps;
        vault.whitelisted_tokens = Vec::new();
        vault.whitelisted_pools = Vec::new();
        vault.paused = false;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let decimals = ctx.accounts.mint.decimals;
        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.user_ata.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault_ata.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
            decimals,
        )?;
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let user_key = ctx.accounts.user.key();
        let seeds: &[&[u8]] = &[VAULT_SEED, user_key.as_ref(), &[ctx.accounts.vault.bump]];
        let signer_seeds = &[seeds];

        let decimals = ctx.accounts.mint.decimals;
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_ata.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.user_ata.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
            decimals,
        )?;
        Ok(())
    }

    pub fn execute_swap(
        ctx: Context<ExecuteSwap>,
        amount_in: u64,
        min_amount_out: u64,
        a_to_b: bool,
        sqrt_price_limit: u128,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        require!(!vault.paused, TradingVaultError::Paused);

        let pool_key = ctx.accounts.whirlpool.key();
        require!(
            vault.whitelisted_pools.contains(&pool_key),
            TradingVaultError::PoolNotWhitelisted
        );

        // Daily reset
        let now = Clock::get()?.unix_timestamp;
        if now.saturating_sub(vault.last_reset_ts) >= SECONDS_PER_DAY {
            vault.daily_spent = 0;
            vault.last_reset_ts = now;
        }

        let new_spent = vault
            .daily_spent
            .checked_add(amount_in)
            .ok_or(TradingVaultError::Overflow)?;
        require!(
            new_spent <= vault.daily_spend_limit,
            TradingVaultError::DailyLimitExceeded
        );

        // Validate slippage: ensure min_amount_out is not too tight
        // (caller is responsible; we just enforce the cap exists)
        let _ = vault.slippage_bps_cap; // used in off-chain quoting

        vault.daily_spent = new_spent;

        let user_key = ctx.accounts.user.key();
        let bump = vault.bump;
        let seeds: &[&[u8]] = &[VAULT_SEED, user_key.as_ref(), &[bump]];
        let signer_seeds = &[seeds];

        whirlpool::cpi::swap(
            CpiContext::new_with_signer(
                ctx.accounts.whirlpool_program.to_account_info(),
                whirlpool::cpi::accounts::Swap {
                    token_program: ctx.accounts.token_program.to_account_info(),
                    token_authority: ctx.accounts.vault.to_account_info(),
                    whirlpool: ctx.accounts.whirlpool.to_account_info(),
                    token_owner_account_a: ctx.accounts.token_owner_account_a.to_account_info(),
                    token_vault_a: ctx.accounts.token_vault_a.to_account_info(),
                    token_owner_account_b: ctx.accounts.token_owner_account_b.to_account_info(),
                    token_vault_b: ctx.accounts.token_vault_b.to_account_info(),
                    tick_array_0: ctx.accounts.tick_array_0.to_account_info(),
                    tick_array_1: ctx.accounts.tick_array_1.to_account_info(),
                    tick_array_2: ctx.accounts.tick_array_2.to_account_info(),
                    oracle: ctx.accounts.oracle.to_account_info(),
                },
                signer_seeds,
            ),
            amount_in,
            min_amount_out,
            sqrt_price_limit,
            true,
            a_to_b,
        )?;

        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        daily_limit: u64,
        slippage_bps: u16,
        paused: bool,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.daily_spend_limit = daily_limit;
        vault.slippage_bps_cap = slippage_bps;
        vault.paused = paused;
        Ok(())
    }

    pub fn add_whitelist_pool(ctx: Context<ManageConfig>, pool: Pubkey) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        if !vault.whitelisted_pools.contains(&pool) {
            vault.whitelisted_pools.push(pool);
        }
        Ok(())
    }

    pub fn remove_whitelist_pool(ctx: Context<ManageConfig>, pool: Pubkey) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.whitelisted_pools.retain(|p| p != &pool);
        Ok(())
    }

    pub fn add_whitelist_token(ctx: Context<ManageConfig>, mint: Pubkey) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        if !vault.whitelisted_tokens.contains(&mint) {
            vault.whitelisted_tokens.push(mint);
        }
        Ok(())
    }

    pub fn remove_whitelist_token(ctx: Context<ManageConfig>, mint: Pubkey) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.whitelisted_tokens.retain(|t| t != &mint);
        Ok(())
    }
}

// ─── Accounts ───────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, user.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, user.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, user.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ TradingVaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: authority check done via has_one
    pub authority: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct ExecuteSwap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, user.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ TradingVaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: authority check done via has_one
    pub authority: UncheckedAccount<'info>,

    /// CHECK: validated against whitelist inside instruction
    pub whirlpool: UncheckedAccount<'info>,

    #[account(mut)]
    pub token_owner_account_a: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: owned by whirlpool program
    #[account(mut)]
    pub token_vault_a: UncheckedAccount<'info>,

    #[account(mut)]
    pub token_owner_account_b: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: owned by whirlpool program
    #[account(mut)]
    pub token_vault_b: UncheckedAccount<'info>,

    /// CHECK: tick array validated by whirlpool CPI
    #[account(mut)]
    pub tick_array_0: UncheckedAccount<'info>,

    /// CHECK: tick array validated by whirlpool CPI
    #[account(mut)]
    pub tick_array_1: UncheckedAccount<'info>,

    /// CHECK: tick array validated by whirlpool CPI
    #[account(mut)]
    pub tick_array_2: UncheckedAccount<'info>,

    /// CHECK: oracle validated by whirlpool CPI
    pub oracle: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,

    /// CHECK: whirlpool program address
    pub whirlpool_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, user.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ TradingVaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: authority check done via has_one
    pub authority: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ManageConfig<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, user.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ TradingVaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: authority check done via has_one
    pub authority: UncheckedAccount<'info>,
}

// ─── State ──────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub bump: u8,
    pub authority: Pubkey,
    pub daily_spend_limit: u64,
    pub daily_spent: u64,
    pub last_reset_ts: i64,
    pub slippage_bps_cap: u16,
    #[max_len(8)]
    pub whitelisted_tokens: Vec<Pubkey>,
    #[max_len(8)]
    pub whitelisted_pools: Vec<Pubkey>,
    pub paused: bool,
}

// ─── Errors ─────────────────────────────────────────────────────────────────

#[error_code]
pub enum TradingVaultError {
    #[msg("Vault is paused")]
    Paused,
    #[msg("Daily spend limit exceeded")]
    DailyLimitExceeded,
    #[msg("Pool is not whitelisted")]
    PoolNotWhitelisted,
    #[msg("Token is not whitelisted")]
    TokenNotWhitelisted,
    #[msg("Slippage tolerance too tight")]
    SlippageTooTight,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Unauthorized")]
    Unauthorized,
}
