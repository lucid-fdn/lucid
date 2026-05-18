import { z } from 'zod'

import type { AgentOpsFindingSeverity } from './workflow-types'
import { buildFindingFingerprint } from './review-findings'
import { wrapUntrustedContent } from '@/lib/security/untrusted-content'

export const REVIEW_SPECIALIST_CATEGORIES = [
  'api',
  'testing',
  'performance',
  'maintainability',
  'migration',
  'security',
  'red_team',
  'devex',
  'accessibility',
] as const

export type ReviewSpecialistCategory = (typeof REVIEW_SPECIALIST_CATEGORIES)[number]

export const REVIEW_MODES = ['daily', 'pre_merge', 'comprehensive', 'red_team'] as const
export type ReviewMode = (typeof REVIEW_MODES)[number]

export const REVIEW_CONFIDENCE_THRESHOLDS = Object.freeze({
  daily: 0.8,
  pre_merge: 0.75,
  comprehensive: 0.55,
  red_team: 0.65,
} satisfies Record<ReviewMode, number>)

export const reviewSpecialistSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1).max(160),
  category: z.enum(REVIEW_SPECIALIST_CATEGORIES),
  defaultSeverity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
  requiredCapabilities: z.array(z.string()).default([]),
  prompt: z.string().min(1).max(4000),
})

export type ReviewSpecialist = z.infer<typeof reviewSpecialistSchema>

export const REVIEW_ARMY_SPECIALISTS = Object.freeze([
  {
    slug: 'correctness',
    name: 'Correctness Reviewer',
    category: 'maintainability',
    defaultSeverity: 'high',
    requiredCapabilities: ['tool:repo.read'],
    prompt: 'Find correctness bugs, behavioral regressions, data-shape mistakes, missing edge-case handling, and concurrency issues. Prefer concrete findings with file/line evidence.',
  },
  {
    slug: 'api-contract',
    name: 'API Contract Reviewer',
    category: 'api',
    defaultSeverity: 'high',
    requiredCapabilities: ['tool:repo.read'],
    prompt: 'Review request/response contracts, auth boundaries, status codes, backwards compatibility, idempotency, pagination, validation, and error semantics.',
  },
  {
    slug: 'testing',
    name: 'Testing Reviewer',
    category: 'testing',
    defaultSeverity: 'medium',
    requiredCapabilities: ['tool:repo.read'],
    prompt: 'Find missing tests, weak assertions, flaky coverage, untested edge cases, unsafe mocks, and verification gaps. Suggest the smallest useful test.',
  },
  {
    slug: 'performance',
    name: 'Performance Reviewer',
    category: 'performance',
    defaultSeverity: 'medium',
    requiredCapabilities: ['tool:repo.read'],
    prompt: 'Review latency, query shape, memory use, network fanout, cache behavior, bundle size, and hot-path allocations. Prioritize measurable user impact.',
  },
  {
    slug: 'migration',
    name: 'Migration Reviewer',
    category: 'migration',
    defaultSeverity: 'high',
    requiredCapabilities: ['tool:repo.read'],
    prompt: 'Review schema migrations, RLS, rollout safety, backfills, data compatibility, rollback paths, indexes, and migration idempotency.',
  },
  {
    slug: 'security',
    name: 'Security Reviewer',
    category: 'security',
    defaultSeverity: 'critical',
    requiredCapabilities: ['tool:repo.read'],
    prompt: 'Review authz/authn, tenant isolation, secrets, injection, SSRF, prompt-injection boundaries, unsafe deserialization, and data exfiltration paths.',
  },
  {
    slug: 'red-team',
    name: 'Red Team Reviewer',
    category: 'red_team',
    defaultSeverity: 'critical',
    requiredCapabilities: ['tool:repo.read'],
    prompt: 'Think adversarially. Look for exploit chains, bypasses, privilege escalation, confused deputy problems, and trust-boundary abuse.',
  },
  {
    slug: 'devex',
    name: 'DevEx Reviewer',
    category: 'devex',
    defaultSeverity: 'low',
    requiredCapabilities: ['tool:repo.read'],
    prompt: 'Review naming, file organization, public APIs, docs, tests, onboarding clarity, and whether future contributors can extend this safely.',
  },
] satisfies ReviewSpecialist[])

const MODE_SPECIALISTS: Record<ReviewMode, string[]> = {
  daily: ['correctness', 'testing'],
  pre_merge: ['correctness', 'api-contract', 'testing', 'security'],
  comprehensive: ['correctness', 'api-contract', 'testing', 'performance', 'migration', 'security', 'devex'],
  red_team: ['security', 'red-team', 'api-contract'],
}

export function getReviewSpecialistsForMode(mode: ReviewMode): readonly ReviewSpecialist[] {
  return MODE_SPECIALISTS[mode].map((slug) => {
    const specialist = REVIEW_ARMY_SPECIALISTS.find((candidate) => candidate.slug === slug)
    if (!specialist) {
      throw new Error(`Unknown review specialist: ${slug}`)
    }
    return specialist
  })
}

export function buildReviewSpecialistPrompt(input: {
  specialist: ReviewSpecialist
  target: string
  diffOrContext: string
  mode?: ReviewMode
}): string {
  const specialist = reviewSpecialistSchema.parse(input.specialist)
  const envelope = wrapUntrustedContent({
    kind: 'repo_diff',
    source: input.target,
    content: input.diffOrContext,
    maxChars: input.mode === 'comprehensive' ? 80_000 : 40_000,
  })

  return [
    `You are the ${specialist.name}.`,
    specialist.prompt,
    'Return only actionable findings. If there are no findings, say so explicitly.',
    'Each finding must include severity, confidence, exact evidence, and a concrete remediation.',
    envelope.wrapped,
  ].join('\n\n')
}

export function normalizeReviewFinding(input: {
  runId: string
  orgId: string
  specialistSlug: string
  severity?: AgentOpsFindingSeverity
  title: string
  body: string
  filePath?: string | null
  startLine?: number | null
  endLine?: number | null
  confidence?: number | null
}) {
  const severity = input.severity ?? specialistDefaultSeverity(input.specialistSlug)
  const fingerprint = buildFindingFingerprint({
    runId: input.runId,
    severity,
    title: input.title,
    filePath: input.filePath,
    startLine: input.startLine,
    body: input.body,
  })

  return {
    orgId: input.orgId,
    runId: input.runId,
    severity,
    title: input.title,
    body: input.body,
    filePath: input.filePath,
    startLine: input.startLine,
    endLine: input.endLine,
    confidence: input.confidence,
    fingerprint,
    metadata: {
      specialist: input.specialistSlug,
      category: REVIEW_ARMY_SPECIALISTS.find((specialist) => specialist.slug === input.specialistSlug)?.category ?? 'maintainability',
    },
  }
}

export function getReviewConfidenceThreshold(mode: ReviewMode): number {
  return REVIEW_CONFIDENCE_THRESHOLDS[mode]
}

export function isActionableReviewFinding(input: {
  mode: ReviewMode
  confidence?: number | null
  severity?: AgentOpsFindingSeverity | null
}): boolean {
  const confidence = input.confidence ?? 1
  if (input.severity === 'critical') return confidence >= 0.5
  return confidence >= getReviewConfidenceThreshold(input.mode)
}

export function filterActionableReviewFindings<T extends {
  confidence?: number | null
  severity?: AgentOpsFindingSeverity | null
}>(mode: ReviewMode, findings: readonly T[]): T[] {
  return findings.filter((finding) => isActionableReviewFinding({ mode, ...finding }))
}

function specialistDefaultSeverity(slug: string): AgentOpsFindingSeverity {
  return REVIEW_ARMY_SPECIALISTS.find((specialist) => specialist.slug === slug)?.defaultSeverity ?? 'medium'
}
