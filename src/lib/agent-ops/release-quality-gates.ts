import type {
  AgentOpsEvidenceType,
  AgentOpsWorkflowId,
} from './workflow-types'

export const RELEASE_QUALITY_CHECK_IDS = [
  'stale-docs',
  'jargon-density',
  'ai-slop-patterns',
  'missing-screenshots',
  'missing-regression-tests',
  'release-note-drift',
  'version-drift',
  'pr-title-sync',
] as const

export type ReleaseQualityCheckId = (typeof RELEASE_QUALITY_CHECK_IDS)[number]

export interface ReleaseQualityCheck {
  id: ReleaseQualityCheckId
  label: string
  promise: string
  required: boolean
  evidenceTypes: readonly AgentOpsEvidenceType[]
  appliesTo: readonly AgentOpsWorkflowId[]
}

export interface ReleaseQualitySignal {
  id: ReleaseQualityCheckId
  status: 'pass' | 'warn' | 'fail' | 'not_applicable'
  message: string
  evidence: Record<string, unknown>
}

const JARGON_TERMS = Object.freeze([
  'seamless',
  'leverage',
  'unlock',
  'robust',
  'revolutionary',
  'cutting-edge',
  'synergy',
  'world-class',
  'game-changing',
])

const AI_SLOP_PATTERNS = Object.freeze([
  'delve into',
  'in today\'s fast-paced',
  'it is worth noting',
  'game changer',
  'unlock the power',
  'seamlessly integrate',
  'revolutionize',
])

export const RELEASE_QUALITY_CHECKS = Object.freeze([
  {
    id: 'stale-docs',
    label: 'Stale docs',
    promise: 'Docs changed or docs freshness was explicitly checked against the release scope.',
    required: true,
    evidenceTypes: ['diff', 'transcript', 'review_finding'],
    appliesTo: ['document-release', 'devex-review', 'devex-audit', 'release-check', 'product-quality-lint', 'ship'],
  },
  {
    id: 'jargon-density',
    label: 'Jargon density',
    promise: 'External-facing copy is plain enough for the intended audience.',
    required: true,
    evidenceTypes: ['transcript', 'review_finding'],
    appliesTo: ['document-release', 'devex-review', 'release-check', 'product-quality-lint', 'ship'],
  },
  {
    id: 'ai-slop-patterns',
    label: 'AI slop patterns',
    promise: 'Docs, release notes, and UI copy avoid generic AI filler and weak product claims.',
    required: true,
    evidenceTypes: ['transcript', 'review_finding', 'screenshot'],
    appliesTo: ['document-release', 'release-check', 'product-quality-lint', 'ship'],
  },
  {
    id: 'missing-screenshots',
    label: 'Missing screenshots',
    promise: 'User-facing UI changes include visual evidence or an explicit non-UI justification.',
    required: true,
    evidenceTypes: ['screenshot', 'transcript', 'review_finding'],
    appliesTo: ['document-release', 'devex-review', 'release-check', 'product-quality-lint', 'ship'],
  },
  {
    id: 'missing-regression-tests',
    label: 'Missing regression tests',
    promise: 'Bug fixes and behavior changes include test evidence or a justified manual test path.',
    required: true,
    evidenceTypes: ['test_result', 'diff', 'review_finding'],
    appliesTo: ['release-check', 'ship', 'version-gate'],
  },
  {
    id: 'release-note-drift',
    label: 'Release note drift',
    promise: 'Release notes match the actual diff, deploy scope, and operator-facing risks.',
    required: true,
    evidenceTypes: ['diff', 'transcript', 'deploy_url'],
    appliesTo: ['document-release', 'release-check', 'version-gate', 'pr-title-sync', 'ship'],
  },
  {
    id: 'version-drift',
    label: 'Version drift',
    promise: 'Version, changelog, migration, and package metadata agree before promotion.',
    required: true,
    evidenceTypes: ['diff', 'test_result', 'review_finding'],
    appliesTo: ['release-check', 'version-gate', 'ship'],
  },
  {
    id: 'pr-title-sync',
    label: 'PR title sync',
    promise: 'PR title, summary, release note, and shipped scope describe the same change.',
    required: false,
    evidenceTypes: ['diff', 'transcript'],
    appliesTo: ['release-check', 'pr-title-sync', 'ship'],
  },
] satisfies readonly ReleaseQualityCheck[])

export function listReleaseQualityChecks(): readonly ReleaseQualityCheck[] {
  return RELEASE_QUALITY_CHECKS
}

export function getReleaseQualityChecksForWorkflow(workflowId: AgentOpsWorkflowId): ReleaseQualityCheck[] {
  return RELEASE_QUALITY_CHECKS
    .filter((check) => (check.appliesTo as readonly AgentOpsWorkflowId[]).includes(workflowId))
    .map((check) => ({ ...check }))
}

export function buildReleaseQualityRuntimeContext(input: {
  workflowId: AgentOpsWorkflowId
}): Record<string, unknown> {
  const checks = getReleaseQualityChecksForWorkflow(input.workflowId)
  return {
    schema_version: 1,
    capability: 'release-quality-gates',
    check_registry: checks.map((check) => ({
      id: check.id,
      label: check.label,
      promise: check.promise,
      required: check.required,
      evidence_types: check.evidenceTypes,
    })),
    required_check_ids: checks.filter((check) => check.required).map((check) => check.id),
    optional_check_ids: checks.filter((check) => !check.required).map((check) => check.id),
    evidence_contract: {
      stale_docs: 'Attach docs diff or explicit freshness rationale.',
      screenshots: 'Attach screenshot evidence for UI-visible changes or justify non-UI scope.',
      tests: 'Attach regression test output for fixed bugs or behavior changes.',
      release_notes: 'Compare release notes to diff/deploy scope.',
      copy_quality: 'Report jargon density and AI slop patterns as findings.',
    },
    policy_gate_targets: ['ship', 'deploy', 'promotion'],
  }
}

export function evaluateReleaseQualityText(input: {
  text: string
  jargonWarnRatio?: number
}): ReleaseQualitySignal[] {
  const words = input.text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []
  const text = input.text.toLowerCase()
  const jargonHits = JARGON_TERMS.filter((term) => text.includes(term))
  const slopHits = AI_SLOP_PATTERNS.filter((pattern) => text.includes(pattern))
  const jargonRatio = words.length === 0 ? 0 : jargonHits.length / words.length
  const warnRatio = input.jargonWarnRatio ?? 0.015

  return [
    {
      id: 'jargon-density',
      status: jargonRatio > warnRatio ? 'warn' : 'pass',
      message: jargonRatio > warnRatio
        ? `Copy has ${jargonHits.length} jargon signal(s); simplify before external handoff.`
        : 'Copy jargon density is within the release-quality budget.',
      evidence: {
        word_count: words.length,
        jargon_hits: jargonHits,
        jargon_ratio: jargonRatio,
        warning_ratio: warnRatio,
      },
    },
    {
      id: 'ai-slop-patterns',
      status: slopHits.length > 0 ? 'warn' : 'pass',
      message: slopHits.length > 0
        ? `Copy contains ${slopHits.length} generic AI/slop pattern(s).`
        : 'No generic AI slop patterns detected.',
      evidence: {
        pattern_hits: slopHits,
      },
    },
  ]
}
