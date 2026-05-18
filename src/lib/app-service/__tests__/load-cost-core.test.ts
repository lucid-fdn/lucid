import { describe, expect, it } from 'vitest'
import {
  APP_SERVICE_ABUSE_PLANNER_PROMPTS,
  APP_SERVICE_LOAD_TARGETS,
  APP_SERVICE_NORMAL_PLANNER_PROMPTS,
  APP_SERVICE_PLANNER_MAX_OUTPUT_TOKENS,
  buildGeneratedFrontendOriginMatrix,
  buildV0QuotaBoundaryCases,
  evaluateGenerationQueue100,
  evaluateLoadTarget,
  evaluatePlannerPromptCost,
  estimatePlannerCostCents,
  publicChatCostCapAllows,
  requiredLoadTargetNames,
  summarizeLoadSamples,
} from '../load-cost-core'
import { PLANNER_SYSTEM_PROMPT } from '../planner-core'

describe('app service load and cost core', () => {
  it('defines the required production load targets', () => {
    expect(requiredLoadTargetNames()).toEqual(expect.arrayContaining([
      'Public app page 10,000 views/hour',
      'Public config runtime',
      'Public chat runtime',
      'Public lead 1,000 submissions/hour',
      'Operator summary',
      'Generation queue 100 queued jobs',
      'v0 daily quota boundary',
      'Vercel preview deployment concurrency',
    ]))
  })

  it('summarizes latency, first-token, cache, error, and cost samples', () => {
    const summary = summarizeLoadSamples([
      { ok: true, latencyMs: 100, firstTokenMs: 80, cacheStatus: 'hit', costCents: 1 },
      { ok: true, latencyMs: 120, firstTokenMs: 90, cacheStatus: 'stale', costCents: 1 },
      { ok: true, latencyMs: 140, firstTokenMs: 100, cacheStatus: 'miss', costCents: 2 },
      { ok: false, latencyMs: 900, firstTokenMs: 500, cacheStatus: 'miss', costCents: 0 },
    ])

    expect(summary).toMatchObject({
      total: 4,
      ok: 3,
      failed: 1,
      errorRate: 0.25,
      p50Ms: 120,
      p95Ms: 900,
      firstTokenP95Ms: 500,
      cacheHitRatio: 0.5,
      averageCostCents: 1,
    })
  })

  it('passes the public app page 10,000 views/hour target when p95 and cache hit ratio are healthy', () => {
    const summary = summarizeLoadSamples(
      Array.from({ length: 100 }, (_, index) => ({
        ok: true,
        latencyMs: index < 95 ? 220 : 620,
        cacheStatus: index < 92 ? 'hit' as const : 'miss' as const,
      })),
    )

    expect(evaluateLoadTarget(APP_SERVICE_LOAD_TARGETS.publicAppPage10k, summary)).toEqual({
      passed: true,
      failures: [],
    })
  })

  it('fails public chat load when first-token latency or cost is above target', () => {
    const summary = summarizeLoadSamples([
      { ok: true, latencyMs: 4000, firstTokenMs: 2900, costCents: 3 },
      { ok: true, latencyMs: 4100, firstTokenMs: 3000, costCents: 3 },
    ])
    const result = evaluateLoadTarget(APP_SERVICE_LOAD_TARGETS.publicChat, summary)

    expect(result.passed).toBe(false)
    expect(result.failures.join('\n')).toContain('first-token p95')
    expect(result.failures.join('\n')).toContain('average cost/request')
  })

  it('passes the 100-job generation queue target without DLQ or failures', () => {
    expect(evaluateGenerationQueue100({
      totalJobs: 100,
      processed: 100,
      failed: 0,
      dlq: 0,
      oldestQueuedAgeMs: 42_000,
    })).toEqual({
      passed: true,
      failures: [],
    })
  })

  it('rejects 100-job generation queue runs with failed jobs or DLQ growth', () => {
    const result = evaluateGenerationQueue100({
      totalJobs: 100,
      processed: 98,
      failed: 2,
      dlq: 1,
      oldestQueuedAgeMs: 301_000,
    })

    expect(result.passed).toBe(false)
    expect(result.failures.join('\n')).toContain('Only 98/100 jobs processed')
    expect(result.failures.join('\n')).toContain('DLQ count 1')
  })

  it('keeps normal planner prompts under the cost and token budget', () => {
    const result = evaluatePlannerPromptCost({
      prompts: APP_SERVICE_NORMAL_PLANNER_PROMPTS,
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      maxInputTokens: 6_000,
      maxOutputTokens: APP_SERVICE_PLANNER_MAX_OUTPUT_TOKENS,
      maxCostCents: 1,
    })

    expect(result).toEqual({ passed: true, failures: [] })
    expect(estimatePlannerCostCents({
      prompt: APP_SERVICE_NORMAL_PLANNER_PROMPTS[0] ?? '',
      systemPrompt: PLANNER_SYSTEM_PROMPT,
    }).costCents).toBeLessThan(1)
  })

  it('catches abuse prompts that would exceed max input limits', () => {
    const result = evaluatePlannerPromptCost({
      prompts: [APP_SERVICE_ABUSE_PLANNER_PROMPTS.join(' ').repeat(200)],
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      maxInputTokens: 6_000,
      maxOutputTokens: APP_SERVICE_PLANNER_MAX_OUTPUT_TOKENS,
      maxCostCents: 1,
    })

    expect(result.passed).toBe(false)
    expect(result.failures.join('\n')).toContain('max input tokens')
  })

  it('enforces public chat cost caps before another request is accepted', () => {
    expect(publicChatCostCapAllows({
      currentMonthlyCostCents: 99,
      estimatedRequestCostCents: 1,
      monthlyLimitCents: 100,
    })).toBe(true)
    expect(publicChatCostCapAllows({
      currentMonthlyCostCents: 100,
      estimatedRequestCostCents: 1,
      monthlyLimitCents: 100,
    })).toBe(false)
    expect(publicChatCostCapAllows({
      currentMonthlyCostCents: 10_000,
      estimatedRequestCostCents: 1,
      monthlyLimitCents: null,
    })).toBe(true)
  })

  it('builds registered and unregistered origin traffic cases', () => {
    expect(buildGeneratedFrontendOriginMatrix({
      registeredOrigins: ['https://preview.example.com', 'https://app.example.com'],
      unregisteredOrigin: 'https://evil.example.com',
    })).toEqual([
      { label: 'registered-origin-1', origin: 'https://preview.example.com', registered: true, expectedStatus: 200 },
      { label: 'registered-origin-2', origin: 'https://app.example.com', registered: true, expectedStatus: 200 },
      { label: 'unregistered-origin', origin: 'https://evil.example.com', registered: false, expectedStatus: 403 },
      { label: 'same-origin-no-header', origin: null, registered: true, expectedStatus: 200 },
    ])
  })

  it('builds v0 daily quota boundary cases', () => {
    expect(buildV0QuotaBoundaryCases(100)).toEqual([
      { label: 'quota-available', usedToday: 99, shouldLaunch: true },
      { label: 'quota-exhausted', usedToday: 100, shouldLaunch: false },
      { label: 'quota-overrun', usedToday: 101, shouldLaunch: false },
    ])
  })
})
