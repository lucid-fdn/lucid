import { describe, it, expect } from 'vitest'
import {
  buildDefaultTradingPolicy,
  buildWalletPromptBlock,
  TRADING_TOOLS_DEFI_ONLY,
  TRADING_CAPABILITIES_DEFI_ONLY,
  TRADING_CAPABILITIES_WITH_TRANSFER,
} from '../helpers'

describe('buildDefaultTradingPolicy', () => {
  it('returns conservative defaults', () => {
    const policy = buildDefaultTradingPolicy('assistant-123')
    expect(policy.max_trade_value_usd).toBe(50)
    expect(policy.daily_limit_usd).toBe(200)
    expect(policy.transfer_mode).toBe('defi_only')
    expect(policy.enabled).toBe(true)
    expect(policy.allowed_chains).toContain('1')
    expect(policy.allowed_chains).toContain('mainnet-beta')
  })
})

describe('buildWalletPromptBlock', () => {
  it('returns empty string when no wallets', () => {
    expect(buildWalletPromptBlock([])).toBe('')
  })

  it('includes both addresses when both chains present', () => {
    const wallets = [
      { chain_type: 'ethereum', address: '0xABC123', status: 'active' },
      { chain_type: 'solana', address: 'Sol456', status: 'active' },
    ]
    const block = buildWalletPromptBlock(wallets)
    expect(block).toContain('0xABC123')
    expect(block).toContain('Sol456')
    expect(block).toContain('Your Wallets')
  })

  it('skips frozen wallets', () => {
    const wallets = [
      { chain_type: 'ethereum', address: '0xABC123', status: 'frozen' },
    ]
    expect(buildWalletPromptBlock(wallets)).toBe('')
  })
})

describe('TRADING_TOOLS_DEFI_ONLY (legacy)', () => {
  it('does not include wallet_transfer', () => {
    expect(TRADING_TOOLS_DEFI_ONLY).not.toContain('wallet_transfer')
  })

  it('includes dex_swap and wallet_balance', () => {
    expect(TRADING_TOOLS_DEFI_ONLY).toContain('dex_swap')
    expect(TRADING_TOOLS_DEFI_ONLY).toContain('wallet_balance')
  })
})

describe('TRADING_CAPABILITIES_DEFI_ONLY', () => {
  it('includes swap, perpetuals, orders, and predictions', () => {
    expect(TRADING_CAPABILITIES_DEFI_ONLY).toContain('execute:swap')
    expect(TRADING_CAPABILITIES_DEFI_ONLY).toContain('execute:perpetuals')
    expect(TRADING_CAPABILITIES_DEFI_ONLY).toContain('execute:orders')
    expect(TRADING_CAPABILITIES_DEFI_ONLY).toContain('execute:predictions')
    expect(TRADING_CAPABILITIES_DEFI_ONLY).toContain('execute:predictions_automation')
  })

  it('does not include transfer', () => {
    expect(TRADING_CAPABILITIES_DEFI_ONLY).not.toContain('execute:transfer')
  })
})

describe('TRADING_CAPABILITIES_WITH_TRANSFER', () => {
  it('includes transfer on top of defi capabilities', () => {
    expect(TRADING_CAPABILITIES_WITH_TRANSFER).toContain('execute:transfer')
    for (const cap of TRADING_CAPABILITIES_DEFI_ONLY) {
      expect(TRADING_CAPABILITIES_WITH_TRANSFER).toContain(cap)
    }
  })
})
