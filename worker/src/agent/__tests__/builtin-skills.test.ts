import { describe, it, expect } from 'vitest'
import { getBuiltinSkills } from '../skills/builtin-skills.js'

const slackPlugin = {
  slug: 'slack',
  kind: 'integration' as const,
  authProvider: 'slack',
}
const discordPlugin = {
  slug: 'discord',
  kind: 'integration' as const,
  authProvider: 'discord',
}
const googlePlugin = {
  slug: 'google',
  kind: 'integration' as const,
  authProvider: 'google',
}

describe('getBuiltinSkills', () => {
  it('always includes market-intelligence', () => {
    const skills = getBuiltinSkills({ wallet_enabled: false, trading_enabled: false })
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).toContain('lucid-market-intelligence')
  })

  it('omits integration-workflow when no integrations are installed', () => {
    const skills = getBuiltinSkills({ wallet_enabled: false, trading_enabled: false })
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).not.toContain('lucid-integration-workflow')
  })

  it('includes integration-workflow when at least one integration is installed', () => {
    const skills = getBuiltinSkills({
      wallet_enabled: false,
      trading_enabled: false,
      plugins: [slackPlugin],
    })
    const integration = skills.find((s) => s.skill_slug === 'lucid-integration-workflow')
    expect(integration).toBeDefined()
    expect(integration!.sanitized_content).toContain('## Slack')
  })

  it('only loads guidance for the installed providers, not the whole catalog', () => {
    const skills = getBuiltinSkills({ plugins: [discordPlugin] })
    const integration = skills.find((s) => s.skill_slug === 'lucid-integration-workflow')
    expect(integration).toBeDefined()
    expect(integration!.sanitized_content).toContain('## Discord')
    expect(integration!.sanitized_content).not.toContain('## Slack')
    expect(integration!.sanitized_content).not.toContain('## Notion')
  })

  it('expands the unified google plugin to all google sub-product folders', () => {
    const skills = getBuiltinSkills({ plugins: [googlePlugin] })
    const content = skills.find((s) => s.skill_slug === 'lucid-integration-workflow')
      ?.sanitized_content ?? ''
    expect(content).toContain('## Gmail')
    expect(content).toContain('## Google Calendar')
    expect(content).toContain('## Google Sheets')
    expect(content).toContain('## Google Drive')
  })

  it('skips non-integration plugins (kind=plugin) entirely', () => {
    const skills = getBuiltinSkills({
      plugins: [{ slug: 'lucid-seo', kind: 'plugin' }],
    })
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).not.toContain('lucid-integration-workflow')
  })

  it('includes web3-reader when wallet enabled but trading disabled', () => {
    const skills = getBuiltinSkills({ wallet_enabled: true, trading_enabled: false })
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).toContain('web3-reader')
    expect(slugs).not.toContain('web3-operator')
  })

  it('includes web3-reader and trading skills when trading enabled', () => {
    const skills = getBuiltinSkills({ wallet_enabled: true, trading_enabled: true })
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).toContain('lucid-swap-execution')
    expect(slugs).toContain('lucid-swap-direction')
    expect(slugs).toContain('web3-reader')
    // web3-operator moved to DB catalog — no longer a built-in skill
    expect(slugs).not.toContain('web3-operator')
  })

  it('prediction skills are NOT built-in (now DB-managed via skill_catalog)', () => {
    const skills = getBuiltinSkills({ wallet_enabled: true, trading_enabled: true })
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).not.toContain('polymarket')
    expect(slugs).not.toContain('lucid-prediction-hedge')
    expect(slugs).not.toContain('lucid-prediction-trading')
  })

  it('excludes web3 skills when wallet disabled', () => {
    const skills = getBuiltinSkills({ wallet_enabled: false, trading_enabled: false })
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).not.toContain('web3-reader')
    expect(slugs).not.toContain('web3-operator')
  })

  it('never loads both web3-reader and web3-operator simultaneously', () => {
    const combos = [
      { wallet_enabled: true, trading_enabled: true },
      { wallet_enabled: true, trading_enabled: false },
      { wallet_enabled: false, trading_enabled: true },
      { wallet_enabled: false, trading_enabled: false },
    ]
    for (const config of combos) {
      const slugs = getBuiltinSkills(config).map((s) => s.skill_slug)
      expect(slugs.includes('web3-reader') && slugs.includes('web3-operator')).toBe(false)
    }
  })

  it('swap-execution skill contains mandatory workflow + policy + entitlement guidance', () => {
    const skills = getBuiltinSkills({ wallet_enabled: true, trading_enabled: true })
    const swap = skills.find((s) => s.skill_slug === 'lucid-swap-execution')
    expect(swap).toBeDefined()
    expect(swap!.sanitized_content).toMatch(/risk_check/i)
    expect(swap!.sanitized_content).toMatch(/dex_swap/i)
    expect(swap!.sanitized_content).toMatch(/CRITICAL/i)
    // Merged from trading-policy
    expect(swap!.sanitized_content).toMatch(/trading policy/i)
    expect(swap!.sanitized_content).toMatch(/get_trading_policy/i)
    // Merged from entitlements
    expect(swap!.sanitized_content).toMatch(/entitlements/i)
  })

  it('swap-direction skill contains gas fee guidance', () => {
    const skills = getBuiltinSkills({ wallet_enabled: true, trading_enabled: true })
    const dir = skills.find((s) => s.skill_slug === 'lucid-swap-direction')
    expect(dir).toBeDefined()
    expect(dir!.sanitized_content).toMatch(/inputToken/i)
    expect(dir!.sanitized_content).toMatch(/outputToken/i)
    expect(dir!.sanitized_content).toMatch(/gas/i)
  })

  it('returns base skills only when called without config', () => {
    const skills = getBuiltinSkills()
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).toContain('lucid-market-intelligence')
    // No integrations means no integration-workflow row
    expect(slugs).not.toContain('lucid-integration-workflow')
    // No wallet/trading skills without config
    expect(slugs).not.toContain('web3-reader')
    expect(slugs).not.toContain('web3-operator')
  })

  it('entitlements and trading-policy are merged into swap-execution (not standalone)', () => {
    const skills = getBuiltinSkills({ wallet_enabled: true, trading_enabled: true })
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).not.toContain('lucid-entitlements')
    expect(slugs).not.toContain('lucid-trading-policy')
    expect(slugs).toContain('lucid-swap-execution')
  })
})
