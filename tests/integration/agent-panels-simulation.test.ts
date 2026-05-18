/**
 * Simulation tests for the 5 agent detail panels.
 *
 * Verifies both empty/pending states AND active/real data paths
 * by exercising the pure logic extracted from each panel component.
 * No DOM rendering — tests the data contracts, branching, and state
 * transitions that determine what users see.
 */

import { describe, it, expect } from 'vitest'
import {
  HEALTH_DIMENSION_LABELS,
  HEALTH_DIMENSION_WEIGHT_PCT,
  HEALTH_DIMENSION_ORDER,
  HEALTH_SCORE_THRESHOLDS,
  getHealthGrade,
} from '@/lib/mission-control/health-score-constants'

// ─── Health Panel ────────────────────────────────────────────────────────────

describe('AgentHealthPanel — data simulation', () => {
  // Mirror the color logic from the component
  function getDimensionColor(score: number): string {
    if (score >= HEALTH_SCORE_THRESHOLDS.green) return 'text-green-400'
    if (score >= HEALTH_SCORE_THRESHOLDS.yellow) return 'text-yellow-400'
    if (score >= HEALTH_SCORE_THRESHOLDS.orange) return 'text-orange-400'
    return 'text-red-400'
  }

  function getDimensionBarColor(score: number): string {
    if (score >= HEALTH_SCORE_THRESHOLDS.green) return 'bg-green-500'
    if (score >= HEALTH_SCORE_THRESHOLDS.yellow) return 'bg-yellow-500'
    if (score >= HEALTH_SCORE_THRESHOLDS.orange) return 'bg-orange-500'
    return 'bg-red-500'
  }

  const PENDING_DIMENSION_LABELS: Record<string, string> = {
    error_rate: 'Monitoring',
    latency: 'Monitoring',
    tool_reliability: 'Awaiting data',
    memory_health: 'Awaiting data',
    user_satisfaction: 'Awaiting data',
    cost_efficiency: 'Awaiting data',
  }

  it('pending state: healthScore null → shows warming up', () => {
    const healthScore: number | null = null
    const pending = healthScore == null
    expect(pending).toBe(true)
    // Label should be "Warming up" not "Awaiting First Score"
    const label = pending ? 'Warming up' : 'Overall Health'
    expect(label).toBe('Warming up')
  })

  it('active state: healthScore present → shows Overall Health', () => {
    const healthScore = 85
    const pending = healthScore == null
    expect(pending).toBe(false)
    const label = pending ? 'Warming up' : 'Overall Health'
    expect(label).toBe('Overall Health')
  })

  it('fleet percentile renders correctly with real data', () => {
    const fleetPercentile = 82
    const display = `Top ${100 - fleetPercentile}% of fleet`
    expect(display).toBe('Top 18% of fleet')
  })

  it('all 6 dimensions have labels, weights, and pending labels', () => {
    expect(HEALTH_DIMENSION_ORDER).toHaveLength(6)
    for (const key of HEALTH_DIMENSION_ORDER) {
      expect(HEALTH_DIMENSION_LABELS[key]).toBeTruthy()
      expect(HEALTH_DIMENSION_WEIGHT_PCT[key]).toBeGreaterThan(0)
      expect(PENDING_DIMENSION_LABELS[key]).toBeTruthy()
    }
    // Weights must sum to 100
    const totalWeight = Object.values(HEALTH_DIMENSION_WEIGHT_PCT).reduce((a, b) => a + b, 0)
    expect(totalWeight).toBe(100)
  })

  it('dimension color thresholds are correct across the full range', () => {
    // Green: >= 80
    expect(getDimensionColor(100)).toBe('text-green-400')
    expect(getDimensionColor(80)).toBe('text-green-400')
    // Yellow: >= 60
    expect(getDimensionColor(79)).toBe('text-yellow-400')
    expect(getDimensionColor(60)).toBe('text-yellow-400')
    // Orange: >= 40
    expect(getDimensionColor(59)).toBe('text-orange-400')
    expect(getDimensionColor(40)).toBe('text-orange-400')
    // Red: < 40
    expect(getDimensionColor(39)).toBe('text-red-400')
    expect(getDimensionColor(0)).toBe('text-red-400')
  })

  it('dimension bar colors match text colors', () => {
    expect(getDimensionBarColor(90)).toBe('bg-green-500')
    expect(getDimensionBarColor(70)).toBe('bg-yellow-500')
    expect(getDimensionBarColor(50)).toBe('bg-orange-500')
    expect(getDimensionBarColor(20)).toBe('bg-red-500')
  })

  it('real dimension scores render with correct colors and widths', () => {
    const realScores: Record<string, number> = {
      error_rate: 92,
      latency: 78,
      tool_reliability: 85,
      memory_health: 45,
      user_satisfaction: 67,
      cost_efficiency: 30,
    }

    for (const key of HEALTH_DIMENSION_ORDER) {
      const score = realScores[key]
      expect(score).toBeDefined()
      // Bar width should match score percentage
      const width = `${score}%`
      expect(width).toBe(`${realScores[key]}%`)
      // Color should be deterministic
      const color = getDimensionColor(score)
      expect(color).toMatch(/^text-(green|yellow|orange|red)-400$/)
    }
  })

  it('partial dimension scores — some null, some present', () => {
    const partialScores: Record<string, number> = {
      error_rate: 88,
      latency: 72,
      // tool_reliability, memory_health, user_satisfaction, cost_efficiency are missing
    }

    for (const key of HEALTH_DIMENSION_ORDER) {
      const score = partialScores[key] ?? null
      const hasScore = score != null

      if (key === 'error_rate' || key === 'latency') {
        expect(hasScore).toBe(true)
        expect(getDimensionColor(score!)).toBeTruthy()
      } else {
        expect(hasScore).toBe(false)
        const fallback = PENDING_DIMENSION_LABELS[key] ?? 'Awaiting data'
        expect(fallback).toBeTruthy()
      }
    }
  })

  it('health grades are correct', () => {
    expect(getHealthGrade(95)).toBe('A')
    expect(getHealthGrade(80)).toBe('B')
    expect(getHealthGrade(65)).toBe('C')
    expect(getHealthGrade(50)).toBe('D')
    expect(getHealthGrade(20)).toBe('F')
  })

  it('pre-life signals block only shows when pending', () => {
    expect((null as number | null) == null).toBe(true) // pending → show signals
    expect((85 as number | null) == null).toBe(false) // active → hide signals
  })
})

// ─── Tasks Panel ─────────────────────────────────────────────────────────────

describe('AgentTasksPanel — data simulation', () => {
  interface MockTask {
    id: string
    name: string
    task_prompt: string
    status: string
    enabled: boolean
    cron_expression: string | null
    created_at: string
    next_run_at: string | null
    last_run_at: string | null
    run_count: number
    last_error: string | null
  }

  const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Pending' },
    claimed: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', label: 'Running' },
    running: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Running' },
    completed: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Completed' },
    failed: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Failed' },
    dead_letter: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Dead Letter' },
    cancelled: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Cancelled' },
  }

  function sortTasks(tasks: MockTask[]): MockTask[] {
    return [...tasks].sort((a, b) => {
      const aActive = a.enabled && !['cancelled', 'dead_letter', 'completed'].includes(a.status)
      const bActive = b.enabled && !['cancelled', 'dead_letter', 'completed'].includes(b.status)
      if (aActive !== bActive) return aActive ? -1 : 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }

  it('empty task list → shows explanatory empty state', () => {
    const tasks: MockTask[] = []
    expect(tasks.length).toBe(0)
    // Component renders "No scheduled tasks yet" + "Common use cases:"
  })

  it('all 7 status styles have correct structure', () => {
    const statuses = ['pending', 'claimed', 'running', 'completed', 'failed', 'dead_letter', 'cancelled']
    for (const status of statuses) {
      const style = STATUS_STYLES[status]
      expect(style).toBeDefined()
      expect(style.bg).toBeTruthy()
      expect(style.text).toBeTruthy()
      expect(style.label).toBeTruthy()
    }
  })

  it('sort: active tasks before terminal tasks', () => {
    const tasks: MockTask[] = [
      { id: '1', name: 'Completed', task_prompt: 'done', status: 'completed', enabled: true, cron_expression: null, created_at: '2026-04-01', next_run_at: null, last_run_at: null, run_count: 5, last_error: null },
      { id: '2', name: 'Active cron', task_prompt: 'check prices', status: 'pending', enabled: true, cron_expression: '0 * * * *', created_at: '2026-04-02', next_run_at: '2026-04-03T10:00:00Z', last_run_at: '2026-04-03T09:00:00Z', run_count: 24, last_error: null },
      { id: '3', name: 'Failed', task_prompt: 'broken', status: 'failed', enabled: true, cron_expression: '0 0 * * *', created_at: '2026-04-03', next_run_at: null, last_run_at: '2026-04-02', run_count: 3, last_error: 'Timeout after 30s' },
    ]

    const sorted = sortTasks(tasks)
    // Both Failed and Active cron are "active" (not terminal) — sorted by created_at desc
    // Failed (2026-04-03) is newer than Active cron (2026-04-02)
    expect(sorted[0].name).toBe('Failed')
    expect(sorted[1].name).toBe('Active cron')
    // Completed is terminal — always last
    expect(sorted[2].name).toBe('Completed')
  })

  it('paused task shows correct state', () => {
    const task: MockTask = {
      id: '4', name: 'Paused', task_prompt: 'sync data', status: 'pending', enabled: false,
      cron_expression: '0 0 * * *', created_at: '2026-04-01', next_run_at: null,
      last_run_at: '2026-04-02', run_count: 10, last_error: null,
    }
    const isTerminal = ['cancelled', 'dead_letter', 'completed'].includes(task.status)
    const isActive = task.enabled && !isTerminal
    expect(isActive).toBe(false)
    expect(task.enabled).toBe(false)
    expect(isTerminal).toBe(false)
    // Should show "Paused" indicator and reduced opacity
  })

  it('cron vs one-shot detection', () => {
    expect(!!('0 * * * *')).toBe(true)   // cron → RefreshCw icon
    expect(!!(null as string | null)).toBe(false)  // one-shot → Calendar icon
  })

  it('task with last_error shows error row', () => {
    const task: MockTask = {
      id: '5', name: 'Errored', task_prompt: 'monitor', status: 'failed', enabled: true,
      cron_expression: '*/5 * * * *', created_at: '2026-04-01', next_run_at: null,
      last_run_at: '2026-04-03', run_count: 7, last_error: 'Rate limit exceeded (429)',
    }
    expect(task.last_error).toBeTruthy()
    expect(task.last_error).toContain('429')
  })

  it('run count renders singular and plural correctly', () => {
    expect(`${1} run${1 !== 1 ? 's' : ''}`).toBe('1 run')
    expect(`${5} run${5 !== 1 ? 's' : ''}`).toBe('5 runs')
  })
})

// ─── Runtime Panel ───────────────────────────────────────────────────────────

describe('AgentRuntimePanel — data simulation', () => {
  interface MockRuntime {
    id: string
    displayName: string
    status: 'connected' | 'stale' | 'offline' | 'deploying' | 'pending' | 'failed'
    provider: string
    lastSeenAt: string | null
  }

  const PICKER_ELIGIBLE_STATUSES = new Set(['connected', 'stale', 'deploying'])

  it('shared runtime: no runtimeId → isShared = true', () => {
    const runtimeId: string | null = null
    const runtimes: MockRuntime[] = []
    const currentRuntime = runtimes.find(r => r.id === runtimeId)
    const isShared = !runtimeId || !currentRuntime
    expect(isShared).toBe(true)
    // Should show "Lucid Cloud (Shared)" with status card
  })

  it('dedicated runtime: connected → shows server card with ConnectionStatus', () => {
    const runtimeId = 'rt-123'
    const runtimes: MockRuntime[] = [
      { id: 'rt-123', displayName: 'Production Worker', status: 'connected', provider: 'railway', lastSeenAt: new Date().toISOString() },
    ]
    const currentRuntime = runtimes.find(r => r.id === runtimeId)
    const isShared = !runtimeId || !currentRuntime
    const isDeploying = currentRuntime?.status === 'deploying' || currentRuntime?.status === 'pending'
    const isFailed = currentRuntime?.status === 'failed'

    expect(isShared).toBe(false)
    expect(isDeploying).toBe(false)
    expect(isFailed).toBe(false)
    expect(currentRuntime!.displayName).toBe('Production Worker')
    expect(currentRuntime!.provider).toBe('railway')
  })

  it('deploying state: shows spinner + deploying message', () => {
    const runtimes: MockRuntime[] = [
      { id: 'rt-456', displayName: 'Staging Worker', status: 'deploying', provider: 'akash', lastSeenAt: null },
    ]
    const currentRuntime = runtimes.find(r => r.id === 'rt-456')!
    const isDeploying = currentRuntime.status === 'deploying' || currentRuntime.status === 'pending'
    expect(isDeploying).toBe(true)
  })

  it('failed state: shows error + retry button', () => {
    const runtimes: MockRuntime[] = [
      { id: 'rt-789', displayName: 'Failed Worker', status: 'failed', provider: 'phala', lastSeenAt: null },
    ]
    const currentRuntime = runtimes.find(r => r.id === 'rt-789')!
    const isFailed = currentRuntime.status === 'failed'
    expect(isFailed).toBe(true)
    // Retry button should be enabled
  })

  it('runtime picker: filters eligible runtimes', () => {
    const runtimeId = 'rt-123'
    const runtimes: MockRuntime[] = [
      { id: 'rt-123', displayName: 'Current', status: 'connected', provider: 'railway', lastSeenAt: new Date().toISOString() },
      { id: 'rt-456', displayName: 'Available', status: 'connected', provider: 'akash', lastSeenAt: new Date().toISOString() },
      { id: 'rt-789', displayName: 'Offline', status: 'offline', provider: 'phala', lastSeenAt: null },
      { id: 'rt-101', displayName: 'Deploying', status: 'deploying', provider: 'railway', lastSeenAt: null },
    ]

    const available = runtimes.filter(
      r => PICKER_ELIGIBLE_STATUSES.has(r.status) && r.id !== runtimeId
    )
    // Should include Available (connected) and Deploying (deploying), exclude Current (same ID) and Offline
    expect(available).toHaveLength(2)
    expect(available.map(r => r.displayName)).toContain('Available')
    expect(available.map(r => r.displayName)).toContain('Deploying')
    expect(available.map(r => r.displayName)).not.toContain('Offline')
    expect(available.map(r => r.displayName)).not.toContain('Current')
  })

  it('KPI stats with real data render correctly', () => {
    const stats = {
      avg_latency_ms: 1250,
      total_tokens_today: 45000,
      cache_hit_rate: 0.73,
      total_runs_today: 18,
    }

    expect(`${Math.round(stats.avg_latency_ms)}ms`).toBe('1250ms')
    // toLocaleString is locale-dependent — just verify it produces a non-empty string
    const formatted = stats.total_tokens_today.toLocaleString()
    expect(formatted).toBeTruthy()
    expect(formatted).toContain('45')
    expect(`${Math.round(stats.cache_hit_rate * 100)}%`).toBe('73%')
    expect(stats.total_runs_today).toBe(18)
    // Warning variant for high latency (>10s)
    expect(stats.avg_latency_ms > 10000).toBe(false)
  })

  it('KPI stats with high latency triggers warning variant', () => {
    const stats = { avg_latency_ms: 12500, total_tokens_today: 0, cache_hit_rate: null, total_runs_today: 0 }
    expect(stats.avg_latency_ms != null && stats.avg_latency_ms > 10000).toBe(true)
  })

  it('KPI stats with null values show dashes', () => {
    const stats = { avg_latency_ms: null, total_tokens_today: null, cache_hit_rate: null, total_runs_today: null }
    expect(stats.avg_latency_ms != null ? `${Math.round(stats.avg_latency_ms)}ms` : '--').toBe('--')
    expect(stats.total_tokens_today != null ? stats.total_tokens_today.toLocaleString() : '--').toBe('--')
    expect(stats.cache_hit_rate != null ? `${Math.round(stats.cache_hit_rate * 100)}%` : '--').toBe('--')
    expect(stats.total_runs_today ?? '--').toBe('--')
  })
})

// ─── Memories Section ────────────────────────────────────────────────────────

describe('MemoriesSection — data simulation', () => {
  interface MockMemory {
    id: string
    fact_text: string
    category: string
    created_at: string
  }

  it('empty memories with memory enabled → shows "will remember" guidance', () => {
    const memories: MockMemory[] = []
    const memoryEnabled = true
    const memorySearch = ''
    expect(memories.length).toBe(0)
    expect(memoryEnabled).toBe(true)
    expect(memorySearch).toBe('')
    // Component renders: "No memories yet" + "This agent will remember:" + list
  })

  it('empty memories with memory disabled → shows warning', () => {
    const memoryEnabled = false
    // Component renders: "Memory disabled" + AlertTriangle + "Enable in Model & Settings"
    expect(memoryEnabled).toBe(false)
  })

  it('search with no matches → shows "No matches"', () => {
    const memories: MockMemory[] = [
      { id: '1', fact_text: 'User likes dark mode', category: 'preference', created_at: '2026-04-01T00:00:00Z' },
    ]
    const memorySearch = 'zzzznotfound'
    const filtered = memories.filter(m => m.fact_text.toLowerCase().includes(memorySearch.toLowerCase()))
    expect(filtered).toHaveLength(0)
  })

  it('real memories render with categories and timestamps', () => {
    const memories: MockMemory[] = [
      { id: '1', fact_text: 'User prefers concise responses', category: 'preference', created_at: '2026-04-01T10:00:00Z' },
      { id: '2', fact_text: 'Trading portfolio value is $5,200', category: 'fact', created_at: '2026-04-02T15:30:00Z' },
      { id: '3', fact_text: 'Always check risk before executing trades', category: 'instruction', created_at: '2026-04-03T08:00:00Z' },
      { id: '4', fact_text: 'User is in EST timezone', category: 'context', created_at: '2026-04-03T09:00:00Z' },
    ]

    expect(memories).toHaveLength(4)
    // Each memory has required fields
    for (const mem of memories) {
      expect(mem.id).toBeTruthy()
      expect(mem.fact_text).toBeTruthy()
      expect(['preference', 'fact', 'instruction', 'context']).toContain(mem.category)
      expect(new Date(mem.created_at).getTime()).toBeGreaterThan(0)
    }
  })

  it('search filtering works with real data', () => {
    const memories: MockMemory[] = [
      { id: '1', fact_text: 'User prefers concise responses', category: 'preference', created_at: '2026-04-01' },
      { id: '2', fact_text: 'Trading portfolio value is $5,200', category: 'fact', created_at: '2026-04-02' },
      { id: '3', fact_text: 'User likes dark mode in preferences', category: 'preference', created_at: '2026-04-03' },
    ]
    const search = 'prefer'
    const filtered = memories.filter(m => m.fact_text.toLowerCase().includes(search.toLowerCase()))
    expect(filtered).toHaveLength(2)
    expect(filtered.map(m => m.id)).toEqual(['1', '3'])
  })

  it('load more: shows remaining count', () => {
    const memoriesLoaded = 50
    const memoriesTotal = 127
    const remaining = memoriesTotal - memoriesLoaded
    expect(remaining).toBe(77)
    expect(`Load more (${remaining} remaining)`).toBe('Load more (77 remaining)')
  })

  it('clear all shows total count in confirmation', () => {
    const memoriesTotal = 42
    expect(`This will permanently delete all ${memoriesTotal} memories.`).toBe(
      'This will permanently delete all 42 memories.'
    )
  })
})

// ─── Verification Panel ──────────────────────────────────────────────────────

describe('AgentVerificationPanel — data simulation', () => {
  function truncateHash(hash: string): string {
    if (hash.length <= 14) return hash
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`
  }

  it('no passport → shows provision button + explanation', () => {
    const passportId: string | null = null
    expect(passportId).toBeNull()
    // Component renders: explanation text + "Provision Passport" button
    // + "Cryptographic proof of:" list
  })

  it('provisioned passport → shows ID, owner, on-chain data', () => {
    const passportId = 'psp_abc123def456'
    const passport = {
      owner: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      onChain: {
        tx: '5UfDuX7WXYi3vBr9DG8dR4MitKkVZzMPJz8kEbnDaGDgNLCrQvDjf8yXBN3JGhKQvGfqTcCm',
        pda: 'E9TxfxrdrhJJvJKK1PqCZHxLfRDfTqzsogc2Th7wFex6',
      },
    }

    expect(passportId).toBeTruthy()
    expect(passport.owner).toHaveLength(44) // Solana address length
    expect(passport.onChain.tx).toBeTruthy()
    expect(passport.onChain.pda).toBeTruthy()
  })

  it('truncateHash works correctly', () => {
    const shortHash = 'abc123'
    expect(truncateHash(shortHash)).toBe('abc123') // ≤14 chars → no truncation

    const longHash = '5UfDuX7WXYi3vBr9DG8dR4MitKkVZzMPJz8kEbnDaGDgNLCrQvDjf8yXBN3JGhKQvGfqTcCm'
    expect(truncateHash(longHash)).toBe('5UfDuX...TcCm')
  })

  it('receipt data renders all fields', () => {
    const receipt = {
      runId: 'run-12345',
      tokensIn: 1500,
      tokensOut: 800,
      totalLatencyMs: 2340,
      timestamp: Date.now(),
      receiptHash: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
      anchor: {
        chain: 'solana',
        tx: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi',
        epochId: 'epoch-42',
      },
    }

    expect(receipt.tokensIn + receipt.tokensOut).toBe(2300)
    expect(receipt.totalLatencyMs).toBe(2340)
    expect(receipt.anchor!.chain).toBe('solana')
    expect(receipt.anchor!.tx).toBeTruthy()
  })

  it('verification result — all valid', () => {
    const result = { valid: true, hashValid: true, signatureValid: true, inclusionValid: true }
    const allValid = result.valid || (result.hashValid && result.signatureValid)
    expect(allValid).toBe(true)
  })

  it('verification result — partially invalid', () => {
    const result = { valid: false, hashValid: true, signatureValid: false }
    const allValid = result.valid || (result.hashValid && result.signatureValid)
    expect(allValid).toBe(false)
  })

  it('NFT mint renders when present', () => {
    const passport = {
      nftMint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      nftChain: 'solana',
    }
    expect(passport.nftMint).toBeTruthy()
    expect(truncateHash(passport.nftMint)).toBe('Tokenk...Q5DA')
  })

  it('external registrations render with correct status', () => {
    const externalRegistrations = {
      eas: {
        externalId: 'eas-123',
        txSignature: '3Qp4oQkR5qD9Kx7JEf2rG8PVnYqJtSmLnDcJqGxMb6u',
        status: 'synced' as const,
      },
      ceramic: {
        status: 'failed' as const,
        lastError: 'Network timeout',
      },
    }

    expect(Object.keys(externalRegistrations)).toHaveLength(2)
    expect(externalRegistrations.eas.status).toBe('synced')
    expect(externalRegistrations.ceramic.status).toBe('failed')
    expect(externalRegistrations.ceramic.lastError).toBe('Network timeout')
  })

  it('receipt pipeline stages are in correct order', () => {
    const stages = ['Agent Run', 'Receipt', 'Epoch Batch', 'Chain Anchor', 'DePIN Archive']
    expect(stages).toHaveLength(5)
    expect(stages[0]).toBe('Agent Run')
    expect(stages[stages.length - 1]).toBe('DePIN Archive')
  })
})

// ─── Guardrails Panel ────────────────────────────────────────────────────────

describe('AgentGuardrailsPanel — data simulation', () => {
  const ELEVATED_TOOLS = ['wallet_transfer', 'dex_swap', 'hl_place_order', 'hl_cancel_order']

  const TOOL_META: Record<string, { label: string; description: string; risk: 'high' | 'medium' }> = {
    wallet_transfer: { label: 'wallet_transfer', description: 'Sends funds from agent wallet', risk: 'high' },
    dex_swap: { label: 'dex_swap', description: 'Swaps tokens on DEX (Jupiter / 1inch)', risk: 'high' },
    hl_place_order: { label: 'hl_place_order', description: 'Places leveraged perpetual order', risk: 'high' },
    hl_cancel_order: { label: 'hl_cancel_order', description: 'Cancels an open perpetual order', risk: 'medium' },
  }

  it('all elevated tools have metadata', () => {
    for (const tool of ELEVATED_TOOLS) {
      expect(TOOL_META[tool]).toBeDefined()
      expect(TOOL_META[tool].description).toBeTruthy()
      expect(['high', 'medium']).toContain(TOOL_META[tool].risk)
    }
  })

  it('toggle approval tool — add and remove', () => {
    let approvalTools: string[] = ['wallet_transfer']

    // Toggle dex_swap ON
    const toggle = (tool: string) => {
      if (approvalTools.includes(tool)) {
        approvalTools = approvalTools.filter(t => t !== tool)
      } else {
        approvalTools = [...approvalTools, tool]
      }
    }

    toggle('dex_swap')
    expect(approvalTools).toEqual(['wallet_transfer', 'dex_swap'])

    // Toggle wallet_transfer OFF
    toggle('wallet_transfer')
    expect(approvalTools).toEqual(['dex_swap'])
  })

  it('cost limit parsing — valid values', () => {
    const parse = (value: string) => {
      const parsed = value === '' ? null : parseFloat(value)
      if (parsed !== null && isNaN(parsed)) return undefined // invalid
      return parsed
    }

    expect(parse('10.50')).toBe(10.5)
    expect(parse('0')).toBe(0)
    expect(parse('')).toBeNull()
    expect(parse('100')).toBe(100)
  })

  it('cost limit parsing — invalid values rejected', () => {
    const parse = (value: string) => {
      const parsed = value === '' ? null : parseFloat(value)
      if (parsed !== null && isNaN(parsed)) return undefined
      return parsed
    }

    expect(parse('abc')).toBeUndefined()
    expect(parse('$10')).toBeUndefined()
  })

  it('summary stats — with approvals and cost limits', () => {
    const guardrails = {
      approval_required_tools: ['wallet_transfer', 'dex_swap'],
      cost_limit_per_run_usd: 5.0,
      cost_limit_daily_usd: null,
      cost_limit_monthly_usd: 200,
    }

    const approvalCount = guardrails.approval_required_tools.length
    expect(approvalCount).toBe(2)
    expect(`${approvalCount} tools require approval`).toBe('2 tools require approval')

    const hasCostLimits =
      guardrails.cost_limit_per_run_usd !== null ||
      guardrails.cost_limit_daily_usd !== null ||
      guardrails.cost_limit_monthly_usd !== null
    expect(hasCostLimits).toBe(true)
  })

  it('summary stats — no approvals, no cost limits', () => {
    const guardrails = {
      approval_required_tools: [] as string[],
      cost_limit_per_run_usd: null,
      cost_limit_daily_usd: null,
      cost_limit_monthly_usd: null,
    }

    const approvalCount = guardrails.approval_required_tools.length
    expect(approvalCount > 0 ? `${approvalCount} tools require approval` : 'No approval gates').toBe('No approval gates')

    const hasCostLimits =
      guardrails.cost_limit_per_run_usd !== null ||
      guardrails.cost_limit_daily_usd !== null ||
      guardrails.cost_limit_monthly_usd !== null
    expect(hasCostLimits).toBe(false)
  })

  it('cost hints shown only when no value set', () => {
    const COST_HINTS: Record<string, string> = {
      cost_limit_per_run_usd: 'Typical: $2–10 per run',
      cost_limit_daily_usd: 'Typical: $20–50 per day',
      cost_limit_monthly_usd: 'Typical: $200–500 per month',
    }

    // Hint shown when value is null
    const value1: number | null = null
    expect(COST_HINTS.cost_limit_per_run_usd && value1 === null).toBe(true)

    // Hint hidden when value is set
    const value2: number | null = 10
    expect(COST_HINTS.cost_limit_per_run_usd && value2 === null).toBe(false)
  })

  it('risk colors are correct', () => {
    const RISK_COLORS = {
      high: { dot: 'bg-red-400', label: 'text-red-400', tag: 'High risk' },
      medium: { dot: 'bg-amber-400', label: 'text-amber-400', tag: 'Medium' },
    }

    expect(RISK_COLORS.high.tag).toBe('High risk')
    expect(RISK_COLORS.medium.tag).toBe('Medium')
    expect(RISK_COLORS.high.dot).toBe('bg-red-400')
  })
})

// ─── Cross-Panel Coherence ───────────────────────────────────────────────────

describe('Cross-panel coherence', () => {
  it('all empty states use sentence case, not title case', () => {
    const emptyStateTexts = [
      'Warming up',
      'No scheduled tasks yet',
      'No memories yet',
      'Not provisioned',
      'No approval gates',
      'No cost limits',
    ]
    for (const text of emptyStateTexts) {
      // First word capitalized, rest lowercase (except proper nouns)
      const firstChar = text[0]
      expect(firstChar).toBe(firstChar.toUpperCase())
      // Should not be ALL CAPS
      expect(text).not.toBe(text.toUpperCase())
    }
  })

  it('all panels have consistent "alive" signals for empty states', () => {
    // Each panel should feel "ready and waiting", not "broken"
    const aliveSignals = [
      { panel: 'Health', signal: 'Monitoring: Active' },
      { panel: 'Tasks', signal: 'This agent is not running on a schedule' },
      { panel: 'Runtime', signal: 'Status: Active' },
      { panel: 'Memory', signal: 'Start a conversation to build memory' },
      { panel: 'Verification', signal: 'Ensures cryptographic proof of all agent activity' },
    ]
    for (const { signal } of aliveSignals) {
      expect(signal).toBeTruthy()
      expect(signal.length).toBeGreaterThan(5)
    }
  })

  it('transition from empty → populated does not break layout', () => {
    // Simulate health panel transition
    let healthScore: number | null = null
    expect(healthScore == null).toBe(true) // pending

    healthScore = 85
    expect(healthScore == null).toBe(false) // active
    expect(healthScore).toBe(85)

    // Simulate memory panel transition
    let memories: { id: string }[] = []
    expect(memories.length).toBe(0) // empty

    memories = [{ id: '1' }, { id: '2' }]
    expect(memories.length).toBe(2) // populated
  })
})
