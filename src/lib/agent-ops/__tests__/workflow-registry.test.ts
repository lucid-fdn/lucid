import { describe, expect, it } from 'vitest'
import { dagSpecSchema } from '@contracts/dag'

import {
  AGENT_OPS_FAILURE_OWNERSHIP_KINDS,
  AGENT_OPS_OUTPUT_SECTIONS,
  AGENT_OPS_WORKFLOW_IDS,
  buildAgentOpsDagSpec,
  getAgentOpsWorkflow,
  listAgentOpsWorkflows,
} from '..'

describe('Agent Ops workflow registry', () => {
  it('registers every canonical workflow id exactly once', () => {
    const workflows = listAgentOpsWorkflows()
    const ids = workflows.map((workflow) => workflow.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.sort()).toEqual([...AGENT_OPS_WORKFLOW_IDS].sort())
  })

  it('keeps workflow slugs unique and boring', () => {
    const slugs = listAgentOpsWorkflows().map((workflow) => workflow.slug)

    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs.every((slug) => /^[a-z0-9][a-z0-9-]*$/.test(slug))).toBe(true)
  })

  it('standardizes outputs across all workflows', () => {
    for (const workflow of listAgentOpsWorkflows()) {
      expect(workflow.outputSections).toEqual(AGENT_OPS_OUTPUT_SECTIONS)
    }
  })

  it('gates DAG-backed workflows on orchestration capability', () => {
    const dagWorkflows = listAgentOpsWorkflows().filter((workflow) => workflow.executionMode === 'dag')

    expect(dagWorkflows.length).toBeGreaterThan(0)
    for (const workflow of dagWorkflows) {
      expect(workflow.requiredCapabilities).toContain('manage:orchestration')
      expect(workflow.steps.length).toBeGreaterThan(0)
    }
  })

  it('requires browser capability for browser evidence workflows', () => {
    const browserWorkflows = listAgentOpsWorkflows().filter((workflow) =>
      workflow.requiredCapabilities.includes('advanced:browser-qa')
    )

    expect(browserWorkflows.length).toBeGreaterThan(0)
    for (const workflow of browserWorkflows) {
      expect(workflow.requiredCapabilities).toContain('tool:browser')
    }
  })

  it('models Browser Operator as cross-vertical workflows, not only frontend QA', () => {
    const browserOperatorWorkflows = [
      'qa',
      'check-page',
      'test-funnel',
      'buy-stuff',
      'research-site',
      'extract-data',
      'monitor-page',
      'update-portal',
      'support-repro',
    ] as const

    for (const workflowId of browserOperatorWorkflows) {
      const workflow = getAgentOpsWorkflow(workflowId)

      expect(workflow.requiredCapabilities).toEqual(expect.arrayContaining([
        'advanced:browser-qa',
        'tool:browser',
      ]))
    }

    expect(getAgentOpsWorkflow('check-page').metadata.browser_operator).toMatchObject({
      mode: 'observe',
      capability: 'browser-operator',
    })
    expect(getAgentOpsWorkflow('extract-data').metadata.browser_operator).toMatchObject({
      mode: 'extract',
    })
    expect(getAgentOpsWorkflow('update-portal').safetyMode).toBe('approval_gated')
  })

  it('keeps Browser Operator workflows compatible with the DAG contract', () => {
    for (const workflowId of ['check-page', 'test-funnel', 'buy-stuff', 'research-site', 'extract-data', 'monitor-page', 'update-portal', 'support-repro'] as const) {
      const spec = buildAgentOpsDagSpec(getAgentOpsWorkflow(workflowId))

      expect(() => dagSpecSchema.parse(spec)).not.toThrow()
      expect(spec.metadata?.agent_ops).toMatchObject({
        workflow_id: workflowId,
      })
    }
  })

  it('keeps browser buying fail-closed and commerce governed', () => {
    const workflow = getAgentOpsWorkflow('buy-stuff')

    expect(workflow.safetyMode).toBe('approval_gated')
    expect(workflow.requiredCapabilities).toEqual(expect.arrayContaining([
      'advanced:browser-qa',
      'tool:browser',
      'core:approvals',
    ]))
    expect(workflow.approvalGates.map((gate) => gate.id)).toEqual([
      'cart-approval',
      'policy-exception-approval',
    ])
    expect(workflow.metadata.agent_commerce).toMatchObject({
      capability: 'agent-commerce',
      checkout_mode: 'fail_closed',
      requires_receipt: true,
    })
    expect(workflow.metadata.browser_checkout).toMatchObject({
      adapter_contract: '@lucid/browser-checkout-adapter',
      default_mode: 'dry_run_until_live_supported',
      assisted_families: expect.arrayContaining(['shopify', 'carrefour', 'amazon']),
      no_silent_fallback_for: expect.arrayContaining(['checkout', 'payment']),
    })
  })

  it('keeps write-capable workflows approval gated', () => {
    const gated = listAgentOpsWorkflows().filter((workflow) => workflow.safetyMode === 'approval_gated')

    expect(gated.length).toBeGreaterThan(0)
    for (const workflow of gated) {
      expect(workflow.approvalGates.length).toBeGreaterThan(0)
      expect(workflow.requiredCapabilities).toContain('core:approvals')
    }
  })

  it('exposes Review Army metadata only on specialist review workflows', () => {
    const review = getAgentOpsWorkflow('review')
    const cso = getAgentOpsWorkflow('cso')
    const securityAudit = getAgentOpsWorkflow('security-audit')

    expect(review.metadata.review_army).toMatchObject({ mode: 'pre_merge' })
    expect(cso.metadata.review_army).toMatchObject({ mode: 'red_team' })
    expect(securityAudit.metadata.review_army).toMatchObject({ mode: 'red_team' })
    expect(getAgentOpsWorkflow('office-hours').metadata.review_army).toBeUndefined()
    expect(getAgentOpsWorkflow('retro').metadata.review_army).toBeUndefined()
  })

  it('attaches eval packs to release, canary, and learning workflows', () => {
    expect(getAgentOpsWorkflow('ship').evalPack.map((scenario) => scenario.id)).toContain('release-gates')
    expect(getAgentOpsWorkflow('canary').evalPack.map((scenario) => scenario.id)).toContain('canary-signal')
    expect(getAgentOpsWorkflow('retro').evalPack.map((scenario) => scenario.id)).toContain('learning-capture')
    expect(getAgentOpsWorkflow('design-review').evalPack.map((scenario) => scenario.id)).toContain('visual-diff')
    expect(getAgentOpsWorkflow('design-consultation').evalPack.map((scenario) => scenario.id)).toContain('taste-transparent')
    expect(getAgentOpsWorkflow('design-variants').evalPack.map((scenario) => scenario.id)).toContain('comparison-board')
    expect(getAgentOpsWorkflow('design-to-code').evalPack.map((scenario) => scenario.id)).toContain('intent-preserved')
    expect(getAgentOpsWorkflow('devex-audit').evalPack.map((scenario) => scenario.id)).toContain('time-to-hello-world')
    expect(getAgentOpsWorkflow('document-release').evalPack.map((scenario) => scenario.id)).toContain('copy-paste-safe')
    expect(getAgentOpsWorkflow('model-benchmark').evalPack.map((scenario) => scenario.id)).toContain('instruction-following')
    expect(getAgentOpsWorkflow('office-hours').evalPack).toEqual([])
  })

  it('requires failure ownership metadata for QA, ship, canary, and retro workflows', () => {
    for (const workflowId of ['qa', 'ship', 'canary', 'retro'] as const) {
      expect(getAgentOpsWorkflow(workflowId).metadata.failure_ownership).toMatchObject({
        required: true,
        categories: [...AGENT_OPS_FAILURE_OWNERSHIP_KINDS],
      })
    }

    expect(getAgentOpsWorkflow('review').metadata.failure_ownership).toBeUndefined()
    expect(getAgentOpsWorkflow('investigate').metadata.failure_ownership).toBeUndefined()
  })

  it('attaches Phase 8 operating-loop checklists to design and docs workflows', () => {
    for (const workflowId of ['design-consultation', 'design-variants', 'design-review', 'design-to-code'] as const) {
      expect(getAgentOpsWorkflow(workflowId).metadata.design_ops).toMatchObject({
        capability: 'design-ops',
        runtime_context: expect.objectContaining({
          profile_table: 'agent_ops_operator_profiles',
          feedback_table: 'agent_ops_design_feedback',
        }),
      })
      expect(getAgentOpsWorkflow(workflowId).metadata.operating_loop).toMatchObject({
        checklist: ['design-variants', 'visual-review', 'design-to-code-prompt', 'visual-diff'],
      })
    }
    expect(getAgentOpsWorkflow('document-release').metadata.operating_loop).toMatchObject({
      checklist: expect.arrayContaining([
        'copy-ready',
        'artifact-rendered',
        'publication-approval',
        'stale-docs',
        'jargon-density',
        'ai-slop-patterns',
        'release-note-drift',
      ]),
    })
    for (const workflowId of ['release-check', 'version-gate', 'pr-title-sync', 'product-quality-lint'] as const) {
      expect(getAgentOpsWorkflow(workflowId).metadata.release_quality).toMatchObject({
        capability: 'release-quality-gates',
        runtime_context: expect.objectContaining({
          capability: 'release-quality-gates',
        }),
      })
      expect(getAgentOpsWorkflow(workflowId).metadata.operating_loop).toHaveProperty('checklist')
    }
    expect(getAgentOpsWorkflow('release-check').metadata.release_quality).toMatchObject({
      checks: expect.arrayContaining(['stale-docs', 'release-note-drift', 'version-drift']),
    })
  })

  it('compiles every DAG-backed workflow into the existing Nerve DagSpec contract', () => {
    for (const workflow of listAgentOpsWorkflows()) {
      if (workflow.executionMode !== 'dag') continue

      const spec = buildAgentOpsDagSpec(workflow)

      expect(() => dagSpecSchema.parse(spec)).not.toThrow()
      expect(spec.metadata?.agent_ops).toMatchObject({
        workflow_id: workflow.id,
        workflow_slug: workflow.slug,
      })
    }
  })

  it('returns immutable workflow definitions', () => {
    const review = getAgentOpsWorkflow('review')

    expect(Object.isFrozen(review)).toBe(true)
    expect(Object.isFrozen(review.steps)).toBe(true)
  })
})
