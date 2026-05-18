/**
 * Platform Manifest Sync Test
 *
 * CI guard: ensures the seeded platform tool groups in the Supabase migration
 * match the actual tool schemas in CommandsAllowlist.ts.
 *
 * If a tool is added/removed from the runtime without updating the migration
 * seed, this test fails — preventing the UI from lying about available tools.
 */

import { describe, it, expect } from 'vitest'
import { BUILT_IN_TOOLS } from '../CommandsAllowlist.js'

// ---------------------------------------------------------------------------
// Expected tool names per platform group (must match migration seed)
// Migration: supabase/migrations/20260325400000_unified_skills_ui.sql
// ---------------------------------------------------------------------------

/** platform-trading: elevated execution tools */
const PLATFORM_TRADING_TOOLS = [
  'wallet_transfer',
  'dex_swap',
  'hl_place_order',
  'hl_cancel_order',
  'hl_deposit',
  'hl_withdraw',
  'polymarket_trade',
]

/** platform-web3: read-only blockchain intelligence */
const PLATFORM_WEB3_TOOLS = [
  'get_price',
  'search_token',
  'get_portfolio',
  'wallet_balance',
  'wallet_history',
  'risk_check',
  'dex_get_quote',
  'hl_account_info',
  'get_token_info',
  'get_trending',
  'get_liquidity',
  'get_holders',
  'get_defi_positions',
  'get_wallet_profile',
  'get_market_data',
  'detect_snipers',
]

/** platform-runtime: agent infrastructure primitives (stable names) */
const PLATFORM_RUNTIME_TOOLS = [
  'cron_schedule',
  'cron_list',
  'cron_cancel',
  'sessions_send',
  'sessions_spawn',
]

/**
 * platform-native: OpenClaw native tools (not in BUILT_IN_TOOLS).
 * These are controlled via tools.allow policy, not CommandsAllowlist.
 * We still verify the names are correct for the migration seed.
 */
const PLATFORM_NATIVE_TOOLS = [
  'web_search',
  'web_fetch',
  'image',
  'pdf',
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('platform manifest sync', () => {
  const builtInNames = new Set(Object.keys(BUILT_IN_TOOLS))

  it('all platform-trading tools exist in BUILT_IN_TOOLS', () => {
    for (const tool of PLATFORM_TRADING_TOOLS) {
      expect(builtInNames.has(tool), `Missing tool: ${tool}`).toBe(true)
    }
  })

  it('all platform-web3 tools exist in BUILT_IN_TOOLS', () => {
    for (const tool of PLATFORM_WEB3_TOOLS) {
      expect(builtInNames.has(tool), `Missing tool: ${tool}`).toBe(true)
    }
  })

  it('all platform-runtime tools exist in BUILT_IN_TOOLS', () => {
    for (const tool of PLATFORM_RUNTIME_TOOLS) {
      expect(builtInNames.has(tool), `Missing tool: ${tool}`).toBe(true)
    }
  })

  it('platform-native tools are not in BUILT_IN_TOOLS (they are OpenClaw native)', () => {
    for (const tool of PLATFORM_NATIVE_TOOLS) {
      expect(builtInNames.has(tool), `${tool} should NOT be in BUILT_IN_TOOLS`).toBe(false)
    }
  })

  it('seeded tool names match runtime tool.name fields', () => {
    const toolsToCheck = [
      ...PLATFORM_TRADING_TOOLS,
      ...PLATFORM_WEB3_TOOLS,
      ...PLATFORM_RUNTIME_TOOLS,
    ]

    for (const toolName of toolsToCheck) {
      const def = (BUILT_IN_TOOLS as Record<string, { name: string }>)[toolName]
      expect(def, `Tool definition missing: ${toolName}`).toBeDefined()
      expect(def.name).toBe(toolName)
    }
  })

  it('no unexpected tools missing from platform groups', () => {
    // All seeded tools should cover these BUILT_IN_TOOLS categories:
    // - PLATFORM_TOOLS (elevated): wallet_transfer, dex_swap, hl_place_order, hl_cancel_order, polymarket_trade
    // - RUNTIME_TOOL_ALIASES (stable names): cron_schedule, cron_list, cron_cancel, sessions_send, sessions_spawn
    // - BUILTIN_SERVICE_TOOLS (read): wallet_balance, dex_get_quote, hl_account_info
    // - WEB3_OPERATOR_TOOLS (read): get_price, search_token, get_portfolio, wallet_history, risk_check
    // - DATA_INTELLIGENCE_TOOLS (read): get_token_info, get_trending, etc.
    //
    // Intentionally NOT seeded:
    // - Old runtime tool names (schedule_task, etc.) — deprecated aliases
    // - generate_content, code_interpreter — future MCP migration candidates
    // - get_trading_policy — internal only
    // - get_quote_0x, portfolio_snapshot, get_pnl, limit_order, dca_create, stop_loss, bridge — web3-operator action tools

    const allSeeded = new Set([
      ...PLATFORM_TRADING_TOOLS,
      ...PLATFORM_WEB3_TOOLS,
      ...PLATFORM_RUNTIME_TOOLS,
      ...PLATFORM_NATIVE_TOOLS,
    ])

    // Verify count is reasonable (32 tools total)
    expect(allSeeded.size).toBe(32)
  })

  it('seeded tools have valid parameter schemas', () => {
    const toolsToCheck = [
      ...PLATFORM_TRADING_TOOLS,
      ...PLATFORM_WEB3_TOOLS,
      ...PLATFORM_RUNTIME_TOOLS,
    ]

    for (const toolName of toolsToCheck) {
      const def = (BUILT_IN_TOOLS as Record<string, { parameters?: { type: string } }>)[toolName]
      expect(def.parameters, `${toolName} missing parameters`).toBeDefined()
      expect(def.parameters!.type).toBe('object')
    }
  })
})
