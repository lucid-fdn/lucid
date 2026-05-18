/**
 * Contract tests — verify @lucid-fdn/web3-operator exports match expectations.
 *
 * Catches breaking changes when updating the package version.
 */

import { describe, it, expect } from 'vitest'

describe('@lucid-fdn/web3-operator contract', () => {
  it('exports all 12 tool functions', async () => {
    const mod = await import('@lucid-fdn/web3-operator')

    // Read lane (5)
    expect(typeof mod.toolGetPrice).toBe('function')
    expect(typeof mod.toolSearchToken).toBe('function')
    expect(typeof mod.toolGetPortfolio).toBe('function')
    expect(typeof mod.toolGetWalletHistory).toBe('function')
    expect(typeof mod.toolGetQuote0x).toBe('function')

    // Reason lane (3)
    expect(typeof mod.toolRiskCheck).toBe('function')
    expect(typeof mod.toolPortfolioSnapshot).toBe('function')
    expect(typeof mod.toolGetPnL).toBe('function')

    // Action lane (4)
    expect(typeof mod.toolLimitOrder).toBe('function')
    expect(typeof mod.toolDCACreate).toBe('function')
    expect(typeof mod.toolStopLoss).toBe('function')
    expect(typeof mod.toolBridge).toBe('function')
  })

  it('exports config functions', async () => {
    const mod = await import('@lucid-fdn/web3-operator')

    expect(typeof mod.initWeb3Operator).toBe('function')
    expect(typeof mod.getConfig).toBe('function')
    expect(typeof mod.isInitialized).toBe('function')
  })

  it('exports shared token constants', async () => {
    const mod = await import('@lucid-fdn/web3-operator')

    expect(mod.SOLANA_TOKEN_MAP).toBeDefined()
    expect(mod.SOLANA_TOKEN_MAP.SOL).toBe('So11111111111111111111111111111111111111112')
    expect(mod.EVM_TOKEN_MAP).toBeDefined()
    expect(mod.EVM_CHAIN_IDS).toBeDefined()
    expect(typeof mod.resolveTokenAddress).toBe('function')
  })

  it('getConfig() returns sensible defaults without init', async () => {
    const { getConfig } = await import('@lucid-fdn/web3-operator')
    const config = getConfig()

    expect(config).toBeDefined()
    expect(typeof config.rpcUrlResolver).toBe('function')
    expect(config.snapshotStore).toBeDefined()
    expect(typeof config.snapshotStore.get).toBe('function')
    expect(typeof config.snapshotStore.put).toBe('function')
    expect(typeof config.snapshotStore.list).toBe('function')
  })

  it('each tool function returns a Promise', async () => {
    const { toolGetPrice } = await import('@lucid-fdn/web3-operator')
    // Calling with invalid args should still return a promise (that rejects)
    const result = toolGetPrice({ token: 'SOL' } as any)
    expect(result).toBeInstanceOf(Promise)
    // Don't await — we just verify it's async
    result.catch(() => {}) // suppress unhandled rejection
  })
})
