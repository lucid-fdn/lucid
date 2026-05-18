import type { TemplateRegistrySeed } from '@/lib/templates/registry'
import { getPlatformTemplateSeeds } from '@/lib/templates/registry'

export type AgentTeamTemplateSimulationFamily =
  | 'sales_prospecting'
  | 'support_success'
  | 'marketing_content_social'
  | 'executive_ops_legal'
  | 'personal_productivity'

export type AgentTeamTemplateSimulationSection = 'summary' | 'findings' | 'evidence' | 'risks' | 'next_actions'

export interface AgentTeamTemplateSimulationScenario {
  id: string
  templateSlug: string
  family: AgentTeamTemplateSimulationFamily
  prompt: string
  evidence: string[]
  expectedTerms: string[]
  expectedSections: AgentTeamTemplateSimulationSection[]
  liveEvidenceAnchors?: string[]
}

const FAMILY_BY_SLUG: Record<string, AgentTeamTemplateSimulationFamily> = {
  'sales-assistant': 'sales_prospecting',
  'sales-outreach-lemlist': 'sales_prospecting',
  'prospect-intelligence': 'sales_prospecting',
  'support-agent': 'support_success',
  'tier1-support': 'support_success',
  'churn-radar': 'support_success',
  'nps-pipeline': 'support_success',
  'content-pipeline': 'marketing_content_social',
  'content-machine': 'marketing_content_social',
  'competitive-intel': 'marketing_content_social',
  'brand-monitor': 'marketing_content_social',
  'social-media-manager': 'marketing_content_social',
  'marketing-campaign': 'marketing_content_social',
  'social-performance': 'marketing_content_social',
  'ai-video-producer': 'marketing_content_social',
  'ceo-briefing': 'executive_ops_legal',
  'contract-sentinel': 'executive_ops_legal',
  'dev-monitor': 'executive_ops_legal',
  'personal-agent': 'personal_productivity',
}

const FAMILY_FIXTURES: Record<AgentTeamTemplateSimulationFamily, Omit<AgentTeamTemplateSimulationScenario, 'id' | 'templateSlug' | 'family'>> = {
  sales_prospecting: {
    prompt: 'Prioritize this account list, draft next steps, and explain what should be verified before outreach.',
    evidence: [
      'CRM fixture: 12 inbound accounts, 4 high-intent form fills, 2 stale opportunities.',
      'Web fixture: one target recently launched a new enterprise plan.',
      'Email fixture: three accounts replied asking for security and procurement details.',
    ],
    expectedTerms: ['account', 'outreach', 'verify', 'next steps'],
    expectedSections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
  },
  support_success: {
    prompt: 'Triage these customer issues, separate routine fixes from escalation risk, and propose safe follow-up.',
    evidence: [
      'Ticket fixture: 18 new tickets, 5 billing questions, 2 possible product regressions.',
      'Customer fixture: one enterprise account has renewal in 21 days.',
      'Knowledge fixture: billing refund policy requires human approval above $500.',
    ],
    expectedTerms: ['customer', 'escalation', 'support', 'follow-up'],
    expectedSections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
  },
  marketing_content_social: {
    prompt: 'Turn this campaign signal into a useful brief with channel ideas, evidence, risks, and next actions.',
    evidence: [
      'Analytics fixture: landing page conversion rose 18% but paid social CAC increased 11%.',
      'Social fixture: competitor launch post is trending in founder and operator communities.',
      'Content fixture: existing pillar article is outdated on pricing and positioning.',
    ],
    expectedTerms: ['campaign', 'channel', 'content', 'evidence'],
    expectedSections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
  },
  executive_ops_legal: {
    prompt: 'Prepare an operator-ready brief: what changed, what decisions are needed, and what risks require review.',
    evidence: [
      'Ops fixture: one production alert was resolved, one dependency remains degraded.',
      'Legal fixture: contract redline includes liability cap and auto-renewal changes.',
      'Leadership fixture: quarterly target is at risk unless pipeline conversion improves.',
    ],
    expectedTerms: ['risk', 'review', 'next actions'],
    expectedSections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
  },
  personal_productivity: {
    prompt: 'Plan a focused day from this inbox/calendar/task context without sending messages or changing calendar events.',
    evidence: [
      'Calendar fixture: three meetings, one conflict, and a 90 minute maker block.',
      'Inbox fixture: two urgent replies, one travel confirmation, and one newsletter digest.',
      'Task fixture: overdue invoice review and draft investor update.',
    ],
    expectedTerms: ['calendar', 'inbox', 'task', 'focus'],
    expectedSections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
  },
}

export function getAgentTeamTemplateSimulationScenarios(): AgentTeamTemplateSimulationScenario[] {
  return getPlatformTemplateSeeds().map((template) => {
    const family = FAMILY_BY_SLUG[template.slug] ?? inferFamily(template)
    const fixture = FAMILY_FIXTURES[family]
    return {
      ...fixture,
      id: `${template.slug}-operator-simulation`,
      templateSlug: template.slug,
      family,
      expectedTerms: Array.from(new Set([
        ...fixture.expectedTerms,
        template.name.split(/\s+/)[0] ?? template.name,
      ])),
    }
  })
}

export function getAgentTeamTemplateSimulationScenario(templateSlug: string): AgentTeamTemplateSimulationScenario {
  const scenario = getAgentTeamTemplateSimulationScenarios().find((item) => item.templateSlug === templateSlug)
  if (!scenario) throw new Error(`No agent-team template simulation scenario registered for ${templateSlug}`)
  return scenario
}

function inferFamily(template: TemplateRegistrySeed): AgentTeamTemplateSimulationFamily {
  const haystack = [template.slug, template.name, template.category, ...(template.tags ?? [])].join(' ').toLowerCase()
  if (/\b(sales|prospect|crm|outreach|pipeline)\b/.test(haystack)) return 'sales_prospecting'
  if (/\b(support|success|nps|churn|ticket|customer)\b/.test(haystack)) return 'support_success'
  if (/\b(marketing|content|social|brand|campaign|video|competitive)\b/.test(haystack)) return 'marketing_content_social'
  if (/\b(ceo|executive|legal|contract|dev|engineering|ops)\b/.test(haystack)) return 'executive_ops_legal'
  return 'personal_productivity'
}
