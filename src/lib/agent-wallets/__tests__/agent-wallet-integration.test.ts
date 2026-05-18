import { describe, it, expect } from 'vitest'
import {
  buildDefaultTradingPolicy,
  buildWalletPromptBlock,
  TRADING_TOOLS_DEFI_ONLY,
  TRADING_TOOLS_WITH_TRANSFER,
} from '../helpers'

describe('Agent Wallet Integration', () => {
  describe('wallet prompt injection', () => {
    it('generates correct prompt block with both chains', () => {
      const wallets = [
        {
          chain_type: 'ethereum',
          address: '0x1234567890abcdef',
          status: 'active',
        },
        {
          chain_type: 'solana',
          address: 'SoLaNaAdDrEsS123',
          status: 'active',
        },
      ]
      const block = buildWalletPromptBlock(wallets)
      expect(block).toContain('0x1234567890abcdef')
      expect(block).toContain('SoLaNaAdDrEsS123')
      expect(block).toContain('Never ask the user')
    })

    it('excludes frozen wallets', () => {
      const wallets = [
        {
          chain_type: 'ethereum',
          address: '0xFROZEN',
          status: 'frozen',
        },
        { chain_type: 'solana', address: 'SolActive', status: 'active' },
      ]
      const block = buildWalletPromptBlock(wallets)
      expect(block).not.toContain('0xFROZEN')
      expect(block).toContain('SolActive')
    })

    it('returns empty for all archived wallets', () => {
      const wallets = [
        {
          chain_type: 'ethereum',
          address: '0xARCHIVED',
          status: 'archived',
        },
      ]
      expect(buildWalletPromptBlock(wallets)).toBe('')
    })

    it('only shows EVM when solana is frozen', () => {
      const wallets = [
        {
          chain_type: 'ethereum',
          address: '0xEVM',
          status: 'active',
        },
        {
          chain_type: 'solana',
          address: 'SolFrozen',
          status: 'frozen',
        },
      ]
      const block = buildWalletPromptBlock(wallets)
      expect(block).toContain('0xEVM')
      expect(block).not.toContain('SolFrozen')
    })
  })

  describe('default trading policy', () => {
    it('has conservative limits', () => {
      const policy = buildDefaultTradingPolicy('test-assistant')
      expect(policy.max_trade_value_usd).toBeLessThanOrEqual(100)
      expect(policy.daily_limit_usd).toBeLessThanOrEqual(500)
      expect(policy.transfer_mode).toBe('defi_only')
    })

    it('includes EVM and Solana chains', () => {
      const policy = buildDefaultTradingPolicy('test-assistant')
      expect(policy.allowed_chains).toContain('1')
      expect(policy.allowed_chains).toContain('8453')
      expect(policy.allowed_chains).toContain('42161')
      expect(policy.allowed_chains).toContain('mainnet-beta')
    })

    it('sets assistant_id correctly', () => {
      const policy = buildDefaultTradingPolicy('my-assistant')
      expect(policy.assistant_id).toBe('my-assistant')
    })
  })

  describe('trading tool lists', () => {
    it('defi-only does not include wallet_transfer', () => {
      expect(TRADING_TOOLS_DEFI_ONLY).not.toContain('wallet_transfer')
    })

    it('defi-only includes core trading tools', () => {
      expect(TRADING_TOOLS_DEFI_ONLY).toContain('dex_swap')
      expect(TRADING_TOOLS_DEFI_ONLY).toContain('wallet_balance')
      expect(TRADING_TOOLS_DEFI_ONLY).toContain('dex_get_quote')
      expect(TRADING_TOOLS_DEFI_ONLY).toContain('hl_account_info')
      expect(TRADING_TOOLS_DEFI_ONLY).toContain('hl_place_order')
      expect(TRADING_TOOLS_DEFI_ONLY).toContain('hl_cancel_order')
    })

    it('with-transfer extends defi-only plus wallet_transfer', () => {
      expect(TRADING_TOOLS_WITH_TRANSFER).toContain('wallet_transfer')
      for (const tool of TRADING_TOOLS_DEFI_ONLY) {
        expect(TRADING_TOOLS_WITH_TRANSFER).toContain(tool)
      }
    })
  })
})
