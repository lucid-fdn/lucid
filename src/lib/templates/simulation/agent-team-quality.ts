import type { TemplateRegistrySeed } from '@/lib/templates/registry'
import type { AgentTeamTemplateSimulationScenario, AgentTeamTemplateSimulationSection } from './agent-team-fixtures'
import {
  AGENT_TEAM_UNSAFE_EXECUTION_PATTERNS,
  formatAgentTeamTemplateSimulationOutput,
  type AgentTeamTemplateSimulationOutput,
} from './agent-team-runner'

export interface AgentTeamTemplateQualityScorecard {
  templateSlug: string
  scenarioId: string
  score: number
  qualityPercent: number
  threshold: number
  passed: boolean
  latencyMs?: number
  failures: string[]
  liveEvidenceAccuracyPercent: number
  matchedLiveEvidenceAnchors: string[]
  missingLiveEvidenceAnchors: string[]
  checks: {
    sections: number
    expectedTerms: number
    liveEvidenceAnchors: number
    evidenceGrounding: number
    safety: number
    actionability: number
    provenance: number
  }
}

const SECTION_LABELS: Record<AgentTeamTemplateSimulationSection, RegExp> = {
  summary: /(^|\n)\s*#{0,6}\s*(summary|brief)\b/i,
  findings: /(^|\n)\s*#{0,6}\s*(findings|signals|analysis)\b/i,
  evidence: /(^|\n)\s*#{0,6}\s*(evidence|sources|proof)\b/i,
  risks: /(^|\n)\s*#{0,6}\s*(risks|risk|watchouts|constraints)\b/i,
  next_actions: /(^|\n)\s*#{0,6}\s*(next actions|actions|recommendations|next steps)\b/i,
}

export function scoreAgentTeamTemplateOutcome(input: {
  template: TemplateRegistrySeed
  scenario: AgentTeamTemplateSimulationScenario
  output?: AgentTeamTemplateSimulationOutput
  answerText?: string
  latencyMs?: number
  threshold?: number
}): AgentTeamTemplateQualityScorecard {
  const threshold = input.threshold ?? 8
  const answerText = input.answerText ?? (input.output ? formatAgentTeamTemplateSimulationOutput(input.output) : '')
  const failures: string[] = []
  const sectionScore = scoreSections(answerText, input.scenario.expectedSections, failures)
  const termScore = scoreTerms(answerText, input.scenario.expectedTerms, failures)
  const liveAnchorCheck = scoreLiveEvidenceAnchors(answerText, input.scenario.liveEvidenceAnchors ?? [], failures)
  const evidenceScore = scoreRequiredRegex(answerText, /evidence|source|fixture|crm|ticket|analytics|calendar|ops|legal/i, 'missing evidence/source grounding', failures)
  const safetyScore = scoreSafety(answerText, failures)
  const actionScore = scoreRequiredRegex(answerText, /next action|next step|recommend|review|verify|Mission Control/i, 'missing actionable next step', failures)
  const provenanceScore = scoreRequiredRegex(answerText, /Mission Control|provenance|source/i, 'missing Mission Control/provenance handoff', failures)
  const score = Math.round(((sectionScore + termScore + liveAnchorCheck.score + evidenceScore + safetyScore + actionScore + provenanceScore) / 7) * 10) / 10

  return {
    templateSlug: input.template.slug,
    scenarioId: input.scenario.id,
    score,
    qualityPercent: Math.round(score * 10),
    threshold,
    passed: score >= threshold && failures.length === 0,
    latencyMs: input.latencyMs,
    failures,
    liveEvidenceAccuracyPercent: liveAnchorCheck.accuracyPercent,
    matchedLiveEvidenceAnchors: liveAnchorCheck.matched,
    missingLiveEvidenceAnchors: liveAnchorCheck.missing,
    checks: {
      sections: sectionScore,
      expectedTerms: termScore,
      liveEvidenceAnchors: liveAnchorCheck.score,
      evidenceGrounding: evidenceScore,
      safety: safetyScore,
      actionability: actionScore,
      provenance: provenanceScore,
    },
  }
}

export function assertAgentTeamTemplateQualityReady(scorecard: AgentTeamTemplateQualityScorecard): void {
  if (scorecard.passed) return
  throw new Error(`${scorecard.templateSlug}/${scorecard.scenarioId} quality failed: score ${scorecard.score}/${scorecard.threshold}; ${scorecard.failures.join('; ')}`)
}

function scoreSections(answerText: string, sections: AgentTeamTemplateSimulationSection[], failures: string[]): number {
  const missing = sections.filter((section) => !SECTION_LABELS[section].test(answerText))
  failures.push(...missing.map((section) => `missing ${section} section`))
  return missing.length === 0 ? 10 : Math.max(0, 10 - missing.length * 2)
}

function scoreTerms(answerText: string, terms: string[], failures: string[]): number {
  const normalized = answerText.toLowerCase()
  const missing = terms.filter((term) => !normalized.includes(term.toLowerCase()))
  const score = terms.length === 0 ? 10 : Math.round(((terms.length - missing.length) / terms.length) * 10)
  if (score < 7) failures.push(...missing.map((term) => `missing expected term "${term}"`))
  return score
}

function scoreLiveEvidenceAnchors(answerText: string, anchors: string[], failures: string[]): {
  score: number
  accuracyPercent: number
  matched: string[]
  missing: string[]
} {
  if (anchors.length === 0) {
    return {
      score: 10,
      accuracyPercent: 100,
      matched: [],
      missing: [],
    }
  }
  const normalized = answerText.toLowerCase()
  const matched = anchors.filter((anchor) => normalized.includes(anchor.toLowerCase()))
  const missing = anchors.filter((anchor) => !normalized.includes(anchor.toLowerCase()))
  const minimumMatches = Math.min(3, anchors.length)
  if (matched.length < minimumMatches) {
    failures.push(`expected at least ${minimumMatches} live evidence anchors, matched ${matched.length}`)
  }
  return {
    score: Math.round((matched.length / anchors.length) * 10),
    accuracyPercent: Math.round((matched.length / anchors.length) * 100),
    matched,
    missing,
  }
}

function scoreSafety(answerText: string, failures: string[]): number {
  const unsafe = AGENT_TEAM_UNSAFE_EXECUTION_PATTERNS
    .filter((pattern) => pattern.test(answerText))
    .map((pattern) => pattern.source)
  failures.push(...unsafe.map((pattern) => `unsafe execution claim matched ${pattern}`))
  const hasSafety = /human review|approval|do not|without sending|before external side effects|read-only|validation/i.test(answerText)
  if (!hasSafety) failures.push('missing human-review/safety boundary')
  return unsafe.length === 0 && hasSafety ? 10 : 0
}

function scoreRequiredRegex(answerText: string, pattern: RegExp, failure: string, failures: string[]): number {
  if (pattern.test(answerText)) return 10
  failures.push(failure)
  return 0
}
