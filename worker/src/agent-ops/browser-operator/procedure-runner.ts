import type { BrowserQaExecutionInput, BrowserQaProvider } from '../browser-qa/types.js'
import { normalizeBrowserQaError } from '../browser-qa/evidence-normalizer.js'
import {
  evaluateBrowserOperatorTrust,
  type BrowserOperatorTrustEvent,
  type BrowserOperatorTrustShieldContext,
} from './trust-shield.js'
import {
  shouldPauseForBrowserOperatorHandoff,
  type BrowserOperatorHandoff,
} from './handoff.js'

export interface BrowserOperatorProcedureRuntimeContext {
  id: string
  name: string | null
  versionId: string | null
  version: number | null
  matchScore: number | null
  matchReasons: string[]
  procedureType: string
  trustState: string
  riskLevel: string
  approvalPolicy: Record<string, unknown>
  capabilities: string[]
  definition: Record<string, unknown>
}

export interface BrowserOperatorProcedureRunResult {
  actionResults: Array<Record<string, unknown>>
  fallbackReason: string | null
  trustEvents: BrowserOperatorTrustEvent[]
  handoff: BrowserOperatorHandoff | null
}

const SAFE_DECLARATIVE_ACTIONS = new Set(['open', 'navigate', 'wait', 'observe', 'summarize'])

export function normalizeBrowserProcedureRuntimeContext(value: unknown): BrowserOperatorProcedureRuntimeContext | null {
  const record = asRecord(value)
  const id = getString(record?.id)
  if (!record || !id) return null
  const version = asRecord(record.version)
  const definition = asRecord(version?.definition)
  if (!version || !definition) return null
  return {
    id,
    name: getString(record.name),
    versionId: getString(version.id),
    version: getNumber(version.version),
    matchScore: getNumber(record.match_score),
    matchReasons: readArray(record.match_reasons).filter((item): item is string => typeof item === 'string'),
    procedureType: getString(record.procedure_type) ?? 'read_only',
    trustState: getString(record.trust_state) ?? 'draft',
    riskLevel: getString(version.risk_level) ?? 'medium',
    approvalPolicy: asRecord(version.approval_policy) ?? {},
    capabilities: readArray(version.capabilities).filter((item): item is string => typeof item === 'string'),
    definition,
  }
}

export function isBrowserOperatorProcedureRunnable(input: {
  procedure: BrowserOperatorProcedureRuntimeContext
  requireActiveTrust?: boolean
}): { runnable: true } | { runnable: false; reason: string } {
  if ((input.requireActiveTrust ?? true) && input.procedure.trustState !== 'active') {
    return { runnable: false, reason: `Procedure trust state ${input.procedure.trustState} is not runnable.` }
  }
  if (input.procedure.riskLevel === 'high' && !approvalAllowsAutomation(input.procedure.approvalPolicy)) {
    return { runnable: false, reason: 'High-risk browser procedure requires human approval before automation.' }
  }
  if (input.procedure.procedureType === 'mutating' && !approvalAllowsAutomation(input.procedure.approvalPolicy)) {
    return { runnable: false, reason: 'Mutating browser procedure requires human approval before automation.' }
  }
  return { runnable: true }
}

export async function runBrowserOperatorProcedure(params: {
  provider: BrowserQaProvider
  input: BrowserQaExecutionInput
  sessionId: string
  targetId: string
  procedure: BrowserOperatorProcedureRuntimeContext
  trustShield: BrowserOperatorTrustShieldContext | null
}): Promise<BrowserOperatorProcedureRunResult> {
  const runnable = isBrowserOperatorProcedureRunnable({ procedure: params.procedure })
  if (!runnable.runnable) {
    return {
      actionResults: [],
      fallbackReason: runnable.reason,
      trustEvents: [],
      handoff: null,
    }
  }

  const steps = readArray(params.procedure.definition.steps).slice(0, 30)
  if (steps.length === 0) {
    return {
      actionResults: [],
      fallbackReason: 'Matched procedure has no executable declarative steps; used generic Browser Operator collection.',
      trustEvents: [],
      handoff: null,
    }
  }

  const actionResults: Array<Record<string, unknown>> = []
  const trustEvents: BrowserOperatorTrustEvent[] = []
  let handoff: BrowserOperatorHandoff | null = null

  for (const [index, rawStep] of steps.entries()) {
    const step = asRecord(rawStep)
    if (!step) continue
    const action = getString(step.action)?.toLowerCase()
    const stepId = getString(step.id) ?? `step-${index + 1}`

    const actionTrust = evaluateBrowserOperatorTrust({
      trustShield: params.trustShield,
      targetUrl: getString(step.target_url ?? step.url) ?? params.input.targetUrl,
      sessionId: params.sessionId,
      requestedAction: action,
      content: step,
    })
    trustEvents.push(...actionTrust.events)
    if (actionTrust.handoff) handoff = actionTrust.handoff
    if (actionTrust.blocked || shouldPauseForBrowserOperatorHandoff(actionTrust.handoff)) {
      actionResults.push({
        step_id: stepId,
        action: action ?? 'unknown',
        ok: false,
        skipped: true,
        reason: actionTrust.blocked ? 'trust_shield_blocked' : 'handoff_required',
        handoff_state: actionTrust.handoff?.state ?? null,
      })
      break
    }

    try {
      if (action === 'open' || action === 'navigate') {
        const url = normalizeHttpUrl(step.target_url ?? step.url)
        if (!url) {
          actionResults.push({ step_id: stepId, action, ok: false, skipped: true, reason: 'missing_url' })
          continue
        }
        const result = await params.provider.navigate({
          ...params.input,
          sessionId: params.sessionId,
          targetId: params.targetId,
          targetUrl: url,
        })
        actionResults.push({
          step_id: stepId,
          action,
          ok: true,
          final_url: result.finalUrl ?? url,
        })
        continue
      }

      if (action === 'wait') {
        await params.provider.waitForReady({
          ...params.input,
          sessionId: params.sessionId,
          targetId: params.targetId,
        })
        actionResults.push({ step_id: stepId, action, ok: true })
        continue
      }

      if (action === 'observe' || action === 'summarize') {
        actionResults.push({ step_id: stepId, action, ok: true, deferred_to_evidence_collection: true })
        continue
      }

      actionResults.push({
        step_id: stepId,
        action: action ?? 'unknown',
        ok: false,
        skipped: true,
        reason: SAFE_DECLARATIVE_ACTIONS.has(action ?? '')
          ? 'unsupported_declarative_action'
          : 'low_level_action_requires_reviewed_provider_capability',
      })
    } catch (error) {
      actionResults.push({
        step_id: stepId,
        action: action ?? 'unknown',
        ok: false,
        error: normalizeBrowserQaError(error),
      })
    }
  }

  const failed = actionResults.filter((result) => result.ok === false)
  return {
    actionResults,
    trustEvents,
    handoff,
    fallbackReason: failed.length === actionResults.length
      ? 'Matched procedure could not execute any declarative step; used generic Browser Operator collection.'
      : null,
  }
}

function approvalAllowsAutomation(policy: Record<string, unknown>): boolean {
  return policy.allow_auto_run === true || policy.allowAutoRun === true
}

function normalizeHttpUrl(value: unknown): string | null {
  const raw = getString(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
