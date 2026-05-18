import 'server-only'

import { ensureAssistantPassport } from '@/lib/ai/passports'
import {
  createAssistant,
  getWorkspace,
  updateAgentGuardrails,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { maskIdentifier } from '@/lib/logging/safe-log'

import { buildRetailSystemPrompt } from './system-prompt'
import { ensureRetailOrg } from './retail-org'
import type { RetailTemplate } from './types'

/**
 * Signals that the user's retail org exists but does not have an active
 * project/environment scope yet — unrecoverable from this path,
 * not a user error. Caller translates this into a 500 at the HTTP edge.
 */
export class RetailWorkspaceUnavailableError extends Error {
  constructor() {
    super('Retail workspace does not have a project yet')
    this.name = 'RetailWorkspaceUnavailableError'
  }
}

interface ProvisionRetailAgentParams {
  userId: string
  template: RetailTemplate
  /** Optional user-chosen name; falls back to the template's default. */
  nameOverride?: string
  /** Optional "what should this agent help with" goal from the wizard. */
  goal?: string
}

interface ProvisionRetailAgentResult {
  assistantId: string
  orgId: string
}

/**
 * Core of the retail funnel's "create an agent" flow, extracted from the
 * HTTP route so it can be exercised (and in future, reused) without
 * mocking CSRF, rate limits, or Request bodies.
 *
 * Responsibilities (all must happen together to keep the funnel honest):
 *   1. Resolve/provision the user's retail personal org
 *   2. Load the default workspace for that org
 *   3. Create the assistant row with template-derived defaults
 *   4. Emit a structured telemetry line for conversion tracking
 *   5. Wire the template's monthly cost cap (non-fatal)
 *   6. Fire-and-forget L2 passport provisioning (non-fatal)
 *
 * HTTP concerns (auth, rate limiting, feature flag, Zod validation,
 * template lookup, response shaping) stay in the route handler — this
 * function assumes the caller has already validated everything and
 * owns the user identity.
 */
export async function provisionRetailAgent(
  params: ProvisionRetailAgentParams,
): Promise<ProvisionRetailAgentResult> {
  const { userId, template, nameOverride, goal } = params

  const orgId = await ensureRetailOrg(userId)
  const workspace = await getWorkspace(userId, orgId)
  if (!workspace?.project?.id || !workspace?.env?.id) {
    throw new RetailWorkspaceUnavailableError()
  }

  // `createAssistant` returns the raw Supabase row with no type narrowing.
  // Narrow once here so downstream code (and our telemetry/passport/cost
  // cap calls) doesn't need `as string` at every property access.
  const assistant = (await createAssistant({
    orgId,
    projectId: workspace.project.id,
    envId: workspace.env.id,
    name: nameOverride?.trim() || template.name,
    systemPrompt: buildRetailSystemPrompt(template, goal),
    memoryEnabled: true,
  })) as unknown as { id: string; name: string }

  // Structured telemetry — one line per successful retail funnel
  // creation. Parseable by log aggregators (Vercel/Datadog) for
  // conversion metrics without a dedicated analytics pipeline.
  console.info('[retail-funnel] agent_created', {
    assistantId: maskIdentifier(assistant.id),
    orgId: maskIdentifier(orgId),
    templateSlug: template.slug,
    userId: maskIdentifier(userId),
  })

  // Wire the template's cost cap onto the new agent. Non-fatal: if the
  // guardrails update fails, the agent is still usable — the operator
  // can set a cap later from Mission Control. We capture the failure so
  // it's visible instead of silently dropped.
  const capResult = await updateAgentGuardrails(assistant.id, orgId, {
    cost_limit_monthly_usd: template.monthlyCostCapUsd,
  })
  if (!capResult.success) {
    ErrorService.captureException(
      new Error(capResult.error || 'Failed to set retail cost cap'),
      {
        severity: 'warning',
        context: {
          source: 'provisionRetailAgent',
          assistantId: assistant.id,
          monthlyCostCapUsd: template.monthlyCostCapUsd,
        },
        tags: { layer: 'service', domain: 'retail' },
      },
    )
  }

  // Passport provisioning is fire-and-forget — L2 outages must not
  // block the funnel. Capture explicitly so we don't lose visibility.
  ensureAssistantPassport({
    assistantId: assistant.id,
    existingPassportId: null,
    name: assistant.name,
  }).catch((err: unknown) => {
    ErrorService.captureException(err as Error, {
      severity: 'warning',
      context: {
        source: 'provisionRetailAgent',
        assistantId: assistant.id,
        step: 'ensureAssistantPassport',
      },
      tags: { layer: 'service', domain: 'retail' },
    })
  })

  return { assistantId: assistant.id, orgId }
}
