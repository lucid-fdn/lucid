import { describe, expect, it } from 'vitest'

import {
  buildReleaseQualityRuntimeContext,
  evaluateReleaseQualityText,
  getReleaseQualityChecksForWorkflow,
  listReleaseQualityChecks,
} from '../release-quality-gates'

describe('Agent Ops release quality gates', () => {
  it('centralizes release/docs/product quality checks in one registry', () => {
    const checks = listReleaseQualityChecks()

    expect(checks.map((check) => check.id)).toEqual(expect.arrayContaining([
      'stale-docs',
      'jargon-density',
      'ai-slop-patterns',
      'missing-screenshots',
      'missing-regression-tests',
      'release-note-drift',
      'version-drift',
      'pr-title-sync',
    ]))
    expect(checks.every((check) => check.evidenceTypes.length > 0)).toBe(true)
  })

  it('builds runtime-agnostic gate context for release-check workflows', () => {
    const context = buildReleaseQualityRuntimeContext({ workflowId: 'release-check' })

    expect(context).toMatchObject({
      schema_version: 1,
      capability: 'release-quality-gates',
      evidence_contract: expect.objectContaining({
        stale_docs: expect.any(String),
        screenshots: expect.any(String),
        tests: expect.any(String),
      }),
      policy_gate_targets: ['ship', 'deploy', 'promotion'],
    })
    expect(context.required_check_ids).toEqual(expect.arrayContaining([
      'stale-docs',
      'missing-regression-tests',
      'release-note-drift',
      'version-drift',
    ]))
  })

  it('scopes checks to the workflow instead of forcing every gate everywhere', () => {
    expect(getReleaseQualityChecksForWorkflow('version-gate').map((check) => check.id)).toEqual([
      'missing-regression-tests',
      'release-note-drift',
      'version-drift',
    ])
    expect(getReleaseQualityChecksForWorkflow('product-quality-lint').map((check) => check.id)).toEqual([
      'stale-docs',
      'jargon-density',
      'ai-slop-patterns',
      'missing-screenshots',
    ])
  })

  it('flags jargon and generic AI slop without depending on a runtime engine', () => {
    const signals = evaluateReleaseQualityText({
      text: 'Unlock the power of a seamless, cutting-edge, robust game changer for teams.',
    })

    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'jargon-density',
        status: 'warn',
      }),
      expect.objectContaining({
        id: 'ai-slop-patterns',
        status: 'warn',
      }),
    ]))
  })
})
