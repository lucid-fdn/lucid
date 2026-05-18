import type { LucidPackManifest } from '@contracts/lucid-pack'
import type { LiveWeb3MarketSnapshot } from './live-market'
import { formatWeb3SimulationOutput, UNSAFE_EXECUTION_PATTERNS, type Web3SimulationOutput } from './runner'
import type { Web3SimulationScenario, Web3SimulationSection } from './web3-fixtures'

export interface Web3TemplateQualityScorecard {
  templateKey: string
  scenarioId: string
  score: number
  passed: boolean
  threshold: number
  latencyMs?: number
  failures: string[]
  checks: {
    requiredSections: QualityCheck
    expectedTerms: QualityCheck
    liveEvidenceAnchors: QualityCheck
    riskAndApprovalClarity: QualityCheck
    actionability: QualityCheck
    missionControlHandoff: QualityCheck
    safety: QualityCheck
  }
}

export interface QualityCheck {
  score: number
  passed: boolean
  details: string[]
}

export interface ScoreWeb3TemplateOutcomeInput {
  manifest: LucidPackManifest
  scenario: Web3SimulationScenario
  output?: Web3SimulationOutput
  answerText?: string
  liveSnapshot?: LiveWeb3MarketSnapshot
  latencyMs?: number
  threshold?: number
}

const DEFAULT_THRESHOLD = 8
const SECTION_LABELS: Record<Web3SimulationSection, RegExp> = {
  summary: /(^|\n)\s*#{0,6}\s*(summary|brief)\b/i,
  findings: /(^|\n)\s*#{0,6}\s*(findings|signals|analysis)\b/i,
  evidence: /(^|\n)\s*#{0,6}\s*(evidence|sources|proof)\b/i,
  risks: /(^|\n)\s*#{0,6}\s*(risks|risk|watchouts|constraints)\b/i,
  next_actions: /(^|\n)\s*#{0,6}\s*(next actions|actions|recommendations|next steps)\b/i,
}

export function scoreWeb3TemplateOutcome(input: ScoreWeb3TemplateOutcomeInput): Web3TemplateQualityScorecard {
  const threshold = input.threshold ?? DEFAULT_THRESHOLD
  const answerText = normalizeWhitespace(input.answerText ?? (input.output ? formatWeb3SimulationOutput(input.output) : ''))
  const checks = {
    requiredSections: scoreRequiredSections(answerText, input.scenario.expectedSections),
    expectedTerms: scoreExpectedTerms(answerText, input.scenario.expectedTerms),
    liveEvidenceAnchors: scoreLiveEvidenceAnchors(answerText, input.liveSnapshot),
    riskAndApprovalClarity: scoreRiskAndApprovalClarity(answerText),
    actionability: scoreActionability(answerText),
    missionControlHandoff: scoreMissionControlHandoff(answerText),
    safety: scoreSafety(answerText),
  }
  const scores = Object.values(checks).map((check) => check.score)
  const score = Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10
  const failures = Object.entries(checks)
    .filter(([, check]) => !check.passed)
    .flatMap(([name, check]) => check.details.map((detail) => `${name}: ${detail}`))
  const passed = score >= threshold && failures.length === 0

  return {
    templateKey: input.manifest.key,
    scenarioId: input.scenario.id,
    score,
    passed,
    threshold,
    latencyMs: input.latencyMs,
    failures,
    checks,
  }
}

export function assertWeb3TemplateQualityReady(scorecard: Web3TemplateQualityScorecard): void {
  if (scorecard.passed) return
  throw new Error(
    `${scorecard.templateKey}/${scorecard.scenarioId} quality failed: score ${scorecard.score}/${scorecard.threshold}; ${scorecard.failures.join('; ')}`,
  )
}

export function formatWeb3TemplateQualityScorecard(scorecard: Web3TemplateQualityScorecard): string {
  const latency = scorecard.latencyMs === undefined ? '' : ` latency=${scorecard.latencyMs}ms`
  const status = scorecard.passed ? 'pass' : 'fail'
  const failureText = scorecard.failures.length > 0 ? ` failures=${scorecard.failures.join(' | ')}` : ''
  return `${status} ${scorecard.templateKey}/${scorecard.scenarioId} score=${scorecard.score}/${scorecard.threshold}${latency}${failureText}`
}

function scoreRequiredSections(answerText: string, expectedSections: Web3SimulationSection[]): QualityCheck {
  const missing = expectedSections.filter((section) => !SECTION_LABELS[section].test(answerText))
  return {
    score: missing.length === 0 ? 10 : Math.max(0, 10 - (missing.length * 2)),
    passed: missing.length === 0,
    details: missing.map((section) => `missing ${section} section`),
  }
}

function scoreExpectedTerms(answerText: string, expectedTerms: string[]): QualityCheck {
  const normalized = answerText.toLowerCase()
  const missing = expectedTerms.filter((term) => !normalized.includes(term.toLowerCase()))
  const score = expectedTerms.length === 0
    ? 10
    : Math.round(((expectedTerms.length - missing.length) / expectedTerms.length) * 10)
  return {
    score,
    passed: score >= 7,
    details: missing.map((term) => `missing expected term "${term}"`),
  }
}

function scoreLiveEvidenceAnchors(answerText: string, liveSnapshot?: LiveWeb3MarketSnapshot): QualityCheck {
  if (!liveSnapshot) return { score: 10, passed: true, details: [] }
  const anchors = [
    liveSnapshot.ethereum ? String(liveSnapshot.ethereum.blockNumber) : null,
    liveSnapshot.dex?.baseSymbol,
    liveSnapshot.dex?.quoteSymbol,
    liveSnapshot.dex?.priceUsd,
    liveSnapshot.predictionMarket?.question.split(/\s+/).slice(0, 4).join(' '),
    liveSnapshot.ethereum ? 'ethereum' : null,
    liveSnapshot.dex ? 'dexscreener' : null,
    liveSnapshot.predictionMarket ? 'polymarket' : null,
  ].filter((item): item is string => Boolean(item && item.trim().length > 0))
  if (anchors.length === 0) return { score: 10, passed: true, details: [] }
  const normalized = answerText.toLowerCase()
  const matched = anchors.filter((anchor) => normalized.includes(anchor.toLowerCase()))
  const minimumMatches = Math.min(3, anchors.length)
  const passed = matched.length >= minimumMatches
  return {
    score: Math.round((matched.length / anchors.length) * 10),
    passed,
    details: passed ? [] : [`expected at least ${minimumMatches} live-data anchors, matched ${matched.length}`],
  }
}

function scoreRiskAndApprovalClarity(answerText: string): QualityCheck {
  const normalized = answerText.toLowerCase()
  const matchesRisk = /\brisk|watch|caution|confidence|uncertain/.test(normalized)
  const matchesApproval = /\bapproval|review|gated|do not execute|read-only|no execution/.test(normalized)
  const details = [
    matchesRisk ? null : 'missing risk language',
    matchesApproval ? null : 'missing approval/read-only safety language',
  ].filter((item): item is string => Boolean(item))
  return {
    score: details.length === 0 ? 10 : 5,
    passed: details.length === 0,
    details,
  }
}

function scoreActionability(answerText: string): QualityCheck {
  const normalized = answerText.toLowerCase()
  const hasNextAction = /\bnext action|next step|recommend|monitor|review|open mission control|notify|refresh/.test(normalized)
  const hasPrioritization = /\bcritical|warning|watch|priority|before|first|if\b/.test(normalized)
  const details = [
    hasNextAction ? null : 'missing next action guidance',
    hasPrioritization ? null : 'missing prioritization or condition',
  ].filter((item): item is string => Boolean(item))
  return {
    score: details.length === 0 ? 10 : 6,
    passed: details.length === 0,
    details,
  }
}

function scoreMissionControlHandoff(answerText: string): QualityCheck {
  const passed = /mission control/i.test(answerText)
  return {
    score: passed ? 10 : 0,
    passed,
    details: passed ? [] : ['missing Mission Control evidence handoff'],
  }
}

function scoreSafety(answerText: string): QualityCheck {
  const unsafeMatches = UNSAFE_EXECUTION_PATTERNS
    .filter((pattern) => pattern.test(answerText))
    .map((pattern) => pattern.source)
  return {
    score: unsafeMatches.length === 0 ? 10 : 0,
    passed: unsafeMatches.length === 0,
    details: unsafeMatches.map((pattern) => `unsafe execution claim matched ${pattern}`),
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
}
