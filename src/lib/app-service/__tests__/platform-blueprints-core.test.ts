import { describe, expect, it } from 'vitest'
import { AppServiceSpecSchema } from '@contracts/app-service'
import {
  APP_SERVICE_FIRST_PLATFORM_BLUEPRINTS,
  APP_SERVICE_FIRST_PLATFORM_BLUEPRINT_SLUGS,
  buildPlatformBlueprintPlannerResult,
  buildPlatformBlueprintSeedRows,
  getFirstPlatformBlueprintBySlug,
  summarizeFirstPlatformBlueprints,
} from '../platform-blueprints-core'

describe('platform blueprints core', () => {
  it('ships the five canonical phase 10 platform blueprints', () => {
    expect(APP_SERVICE_FIRST_PLATFORM_BLUEPRINT_SLUGS).toEqual([
      'support-concierge',
      'ai-sdr-lead-qualifier',
      'content-engine',
      'ops-monitor',
      'internal-knowledge-assistant',
    ])

    expect(APP_SERVICE_FIRST_PLATFORM_BLUEPRINTS.map((blueprint) => blueprint.spec.category)).toEqual([
      'support',
      'sales',
      'content',
      'ops',
      'knowledge',
    ])

    for (const blueprint of APP_SERVICE_FIRST_PLATFORM_BLUEPRINTS) {
      expect(() => AppServiceSpecSchema.parse(blueprint.spec)).not.toThrow()
      expect(blueprint.requiredInputs.some((input) => input.required)).toBe(true)
      expect(blueprint.generatedAssets.length).toBeGreaterThanOrEqual(3)
      expect(blueprint.proofMetrics.length).toBeGreaterThanOrEqual(3)
      expect(blueprint.launchChecklist.length).toBeGreaterThanOrEqual(4)
      expect(blueprint.growthHooks.length).toBeGreaterThanOrEqual(3)
      expect(blueprint.spec.deployment.runtime.agent_runtime_target).toBe('shared_worker')
      expect(blueprint.spec.deployment.runtime.generation_runtime_target).toBe('shared_appgen_worker')
      expect(blueprint.spec.deployment.allowed_targets).toContain('lucid_hosted')
      expect(blueprint.spec.eval_pack.length).toBeGreaterThan(0)
    }
  })

  it('builds approved platform seed rows with SDK-safe frontend briefs', () => {
    const rows = buildPlatformBlueprintSeedRows()

    expect(rows).toHaveLength(5)
    expect(rows.map((row) => row.status)).toEqual(['approved', 'approved', 'approved', 'approved', 'approved'])
    expect(rows.map((row) => row.source)).toEqual(['platform', 'platform', 'platform', 'platform', 'platform'])
    expect(rows[0].frontend_brief.sdk_package).toBe('@lucid/app-runtime-sdk')
    expect(rows[0].tags).toEqual(expect.arrayContaining(['platform-blueprint', 'first-five']))
  })

  it('summarizes catalog metadata for one-click UX', () => {
    const summaries = summarizeFirstPlatformBlueprints()

    expect(summaries.find((summary) => summary.slug === 'content-engine')).toMatchObject({
      name: 'Content Engine',
      category: 'content',
      generated_assets: expect.arrayContaining(['research agent', 'writing agent']),
      proof_metrics: expect.arrayContaining(['drafts_created']),
    })
  })

  it('returns deterministic planner results for platform blueprint slugs', () => {
    const result = buildPlatformBlueprintPlannerResult('ops-monitor')

    expect(getFirstPlatformBlueprintBySlug('ops-monitor')?.spec.name).toBe('Ops Monitor')
    expect(result?.spec.slug).toBe('ops-monitor')
    expect(result?.recommended_next_steps).toContain('Connect signal source')
    expect(buildPlatformBlueprintPlannerResult('missing')).toBeNull()
  })
})
