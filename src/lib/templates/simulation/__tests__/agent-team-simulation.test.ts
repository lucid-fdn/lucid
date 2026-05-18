import { describe, expect, it } from 'vitest'
import { WEB3_CAPABILITY_TEMPLATES } from '@/lib/templates/capabilities/catalog'
import { getPlatformTemplateSeeds } from '@/lib/templates/registry'
import { buildTemplateLibraryItems } from '@/lib/templates/library'
import { getAgentTeamTemplateSimulationScenario, getAgentTeamTemplateSimulationScenarios } from '../agent-team-fixtures'
import { buildLiveAgentTeamScenario, type LiveAgentTeamSourceSnapshot } from '../agent-team-live'
import { assertAgentTeamTemplateQualityReady, scoreAgentTeamTemplateOutcome } from '../agent-team-quality'
import {
  assertAgentTeamTemplateSimulationReady,
  formatAgentTeamTemplateSimulationOutput,
  runAgentTeamTemplateSimulation,
} from '../agent-team-runner'

describe('agent-team template simulations', () => {
  it('has one simulation scenario per platform template', () => {
    expect(getAgentTeamTemplateSimulationScenarios().map((scenario) => scenario.templateSlug).sort()).toEqual(
      getPlatformTemplateSeeds().map((template) => template.slug).sort(),
    )
  })

  it('produces safe answer-shaped output for every agent-team template', () => {
    for (const template of getPlatformTemplateSeeds()) {
      const scenario = getAgentTeamTemplateSimulationScenario(template.slug)
      const result = runAgentTeamTemplateSimulation({ template, scenario })
      const quality = scoreAgentTeamTemplateOutcome({
        template,
        scenario,
        output: result.output,
        answerText: formatAgentTeamTemplateSimulationOutput(result.output),
      })

      expect(() => assertAgentTeamTemplateSimulationReady(result)).not.toThrow()
      expect(() => assertAgentTeamTemplateQualityReady(quality)).not.toThrow()
      expect(result.output.summary).toContain(template.name)
      expect(result.output.evidence.length).toBeGreaterThanOrEqual(3)
      expect(result.output.risks.join('\n')).toMatch(/human|approval|do not/i)
      expect(result.output.next_actions.join('\n')).toContain('Mission Control')
    }
  })

  it('normalizes agent-team and capability templates into one library contract', () => {
    const items = buildTemplateLibraryItems({
      templates: getPlatformTemplateSeeds().map((template, index) => ({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        slug: template.slug,
        name: template.name,
        description: template.description ?? null,
        category: template.category,
        kind: template.kind,
        source: 'platform',
        status: 'approved',
        is_public: true,
        owner_org_id: null,
        spec: template.spec,
        params: template.params ?? [],
        preview_prompt: template.preview_prompt ?? null,
        tags: template.tags ?? [],
        install_count: 0,
        created_by: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        version: template.version ?? '1.0.0',
        changelog: null,
        forked_from_id: null,
        forked_from_ver: null,
        component_type: null,
        cert_status: 'uncertified',
        cert_score: null,
        cert_checked_at: null,
        outcome_data: {},
      })),
      capabilityPacks: WEB3_CAPABILITY_TEMPLATES.slice(0, 1).map((manifest) => ({
        id: '11111111-1111-4111-8111-111111111111',
        orgId: null,
        packKey: manifest.key,
        name: manifest.name,
        description: manifest.description,
        version: manifest.version,
        manifest,
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
    })

    expect(items.some((item) => item.type === 'capability' && item.action === 'preview_install')).toBe(true)
    expect(items.some((item) => item.type === 'agent' && item.action === 'deploy')).toBe(true)
    expect(items.some((item) => item.type === 'team' && item.action === 'deploy')).toBe(true)
  })

  it('fails quality on unsafe side-effect claims', () => {
    const template = getPlatformTemplateSeeds().find((item) => item.slug === 'sales-assistant')!
    const scenario = getAgentTeamTemplateSimulationScenario(template.slug)
    const quality = scoreAgentTeamTemplateOutcome({
      template,
      scenario,
      answerText: 'Summary: I sent the outreach. Findings: done.',
    })

    expect(quality.passed).toBe(false)
    expect(quality.failures.join('\n')).toMatch(/unsafe|missing/i)
  })

  it('enriches every non-Web3 family with live evidence anchors', () => {
    const snapshot = buildFixtureLiveSnapshot()

    for (const template of getPlatformTemplateSeeds()) {
      const scenario = buildLiveAgentTeamScenario({
        scenario: getAgentTeamTemplateSimulationScenario(template.slug),
        snapshot,
      })
      const result = runAgentTeamTemplateSimulation({ template, scenario })
      const report = formatAgentTeamTemplateSimulationOutput(result.output)
      const quality = scoreAgentTeamTemplateOutcome({
        template,
        scenario,
        answerText: report,
      })

      expect(scenario.liveEvidenceAnchors?.length).toBeGreaterThan(0)
      for (const anchor of scenario.liveEvidenceAnchors ?? []) {
        expect(report.toLowerCase()).toContain(anchor.toLowerCase())
      }
      expect(() => assertAgentTeamTemplateQualityReady(quality)).not.toThrow()
    }
  })
})

function buildFixtureLiveSnapshot(): LiveAgentTeamSourceSnapshot {
  return {
    fetchedAt: '2026-05-13T12:00:00.000Z',
    sourceStatuses: {
      github: 'live',
      github_issues: 'live',
      hackernews: 'live',
      npm: 'live',
      github_status: 'live',
    },
    warnings: [],
    familyEvidence: {
      sales_prospecting: [
        'Live GitHub repo signal: vercel/next.js has 130000 stars and 2900 open issues.',
        'Live Hacker News signal: "AI agents move into operator workflows" has 321 points.',
      ],
      support_success: [
        'Live GitHub issue signal: #1729 "Checkout flow intermittently times out" is open.',
        'Live platform status signal: GitHub status is none - All Systems Operational.',
      ],
      marketing_content_social: [
        'Live Hacker News signal: "AI agents move into operator workflows" has 321 points.',
        'Live npm demand signal: next had 4200000 downloads during fixture-week.',
      ],
      executive_ops_legal: [
        'Live platform status signal: GitHub status is none - All Systems Operational.',
        'Live GitHub repo signal: vercel/next.js has 130000 stars and 2900 open issues.',
      ],
      personal_productivity: [
        'Live platform status signal: GitHub status is none - All Systems Operational.',
        'Live Hacker News signal: "AI agents move into operator workflows" has 321 points.',
      ],
    },
    familyAnchors: {
      sales_prospecting: ['vercel/next.js', '2900', 'Hacker News'],
      support_success: ['#1729', 'Checkout flow intermittently times out', 'GitHub status', 'none'],
      marketing_content_social: ['Hacker News', 'AI agents move into', 'npm', 'next'],
      executive_ops_legal: ['GitHub status', 'none', 'vercel/next.js', '2900'],
      personal_productivity: ['GitHub status', 'none', 'Hacker News', 'AI agents move into'],
    },
  }
}
