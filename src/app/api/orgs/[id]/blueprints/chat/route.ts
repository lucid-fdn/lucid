import { NextRequest, NextResponse } from 'next/server'
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai'
import { z } from 'zod'

import {
  projectBuilderArtifactSchema,
  buildProjectBuilderAssistantMessage,
  buildProjectBuilderStreamingPreamble,
  deriveBuilderStage,
  buildProjectBuilderFollowUpQuestion,
  projectBuilderProgressSchema,
  projectBuilderStreamDataSchema,
  type ProjectBuilderUIMessage,
} from '@/lib/ai/project-generation/chat'
import { generateProjectBuilderAnswer } from '@/lib/ai/project-generation/builder-answer-service'
import { buildBuilderActionCatalog } from '@/lib/ai/project-generation/builder-action-catalog'
import { buildOptimisticBuilderDraft } from '@/lib/ai/project-generation/optimistic-draft'
import { projectBlueprintFromDraft } from '@/lib/ai/project-generation/draft'
import { generationDraftSchema } from '@/lib/ai/project-generation/schemas'
import { checkAIGenerationRateLimit, recordAIGenerationEvent } from '@/lib/ai/rate-limit'
import { DEFAULT_MODEL_ID } from '@/lib/ai/models'
import { validateAIPrompt } from '@/lib/ai/validation'
import { withCSRF } from '@/lib/auth/csrf'
import { requireOrgRequestContext } from '@/lib/request-context/org'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import { ErrorService } from '@/lib/errors/error-service'
import { incrementUsage } from '@/lib/plans'
import { serializeProjectBlueprint } from '@/lib/projects/blueprint-serialization'
import { getUnifiedSkillsForOrg } from '@/lib/db/unified-skills'
import type { UnifiedSkillItem } from '@contracts/unified-skill'
import { classifyBuilderTurnWithAI } from '@/lib/ai/project-generation/turn-classifier'
import {
  classifyBuilderTurn,
  shouldUseDeterministicBuilderTurnClassification,
} from '@/lib/ai/project-generation/turn-routing'
import {
  resolveProjectBuilderModels,
  runProjectBuilderTurn,
} from '@/lib/ai/services/builder-service'
import { logBuilderError, logBuilderTelemetry } from '@/lib/ai/project-generation/builder-telemetry'

export const dynamic = 'force-dynamic'

const routeParamsSchema = z.object({
  id: z.string().uuid(),
})

const requestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()).optional(),
  message: z.string().trim().optional(),
  draft: generationDraftSchema.optional(),
  selected_template_slug: z.string().trim().optional(),
  preferred_mode: z.enum(['auto', 'template', 'agent', 'team']).optional(),
  runtime_mode: z.enum(['shared', 'dedicated', 'byo']).optional(),
  model: z.string().trim().optional(),
  available_unified_skills: z.array(z.custom<UnifiedSkillItem>()).max(100).optional(),
})

type BuilderChatPreflightTimings = {
  auth_ms: number
  access_ms: number
  body_ms: number
  rateLimit_ms: number
  entitlement_ms: number
  total_ms: number
}

export const POST = withCSRF(async (
  req: NextRequest,
  ctx: unknown,
): Promise<Response> => {
  try {
    const requestStartedAt = Date.now()
    const { id: orgId } = routeParamsSchema.parse(
      await (ctx as { params: Promise<{ id: string }> }).params,
    )

    const contextResult = await requireOrgRequestContext({ orgId, permission: 'editProjects' })
    if (!contextResult.ok) {
      return contextResult.response
    }
    const requestContext = contextResult.context
    const userId = requestContext.userId

    const bodyStartedAt = Date.now()
    const body = requestSchema.parse(await req.json())
    const prompt = extractLatestUserMessage(body.messages) ?? body.message ?? ''
    const promptValidation = validateAIPrompt(prompt)
    if (!promptValidation.valid || !promptValidation.sanitized) {
      return NextResponse.json(
        { error: 'Invalid input', issues: promptValidation.issues ?? ['Prompt is required'] },
        { status: 400 },
      )
    }
    const sanitizedPrompt = promptValidation.sanitized
    const bodyReadyAt = Date.now()
    const deterministicPreflight = classifyBuilderTurn({
      prompt: sanitizedPrompt,
      draft: body.draft,
    })

    const rateLimitStartedAt = Date.now()
    const rateLimit = await checkAIGenerationRateLimit(userId)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 },
      )
    }
    const rateLimitReadyAt = Date.now()

    const entitlementStartedAt = Date.now()
    const entitlement = await evaluateEntitlement({ orgId, action: 'ai_query' })
    const entitlementGuard = guardEntitlement(entitlement, { orgId, route: '/api/orgs/[id]/blueprints/chat' })
    if (entitlementGuard) return entitlementGuard
    const entitlementReadyAt = Date.now()
    const preflightTimings: BuilderChatPreflightTimings = {
      auth_ms: requestContext.timings.auth_ms,
      access_ms: requestContext.timings.access_ms,
      body_ms: bodyReadyAt - bodyStartedAt,
      rateLimit_ms: rateLimitReadyAt - rateLimitStartedAt,
      entitlement_ms: entitlementReadyAt - entitlementStartedAt,
      total_ms: entitlementReadyAt - requestStartedAt,
    }

    logBuilderTelemetry('[builder:chat-route]', {
      orgId,
      phase: 'preflight',
      auth_ms: preflightTimings.auth_ms,
      access_ms: preflightTimings.access_ms,
      access_source: requestContext.timings.access_source,
      body_ms: preflightTimings.body_ms,
      rateLimit_ms: preflightTimings.rateLimit_ms,
      entitlement_ms: preflightTimings.entitlement_ms,
      total_ms: preflightTimings.total_ms,
    })

    const requestedModelId = body.model || DEFAULT_MODEL_ID

    const stream = createUIMessageStream<ProjectBuilderUIMessage>({
      execute: async ({ writer }) => {
        const isInitial = !body.draft
        const progressDraft = body.draft ?? buildOptimisticBuilderDraft(sanitizedPrompt)
        const shouldStreamDraftPreview = deterministicPreflight.type === 'config_change'
          || deterministicPreflight.type === 'clarification_answer'
        const writeProgress = (status: string, draft = progressDraft) => {
          writer.write({
            type: 'data-builder-progress',
            data: projectBuilderProgressSchema.parse({
              draft,
              blueprint: projectBlueprintFromDraft(draft),
              status,
            }),
            transient: true,
          })
        }

        if (shouldStreamDraftPreview) {
          writeProgress(isInitial ? 'Creating the first draft...' : 'Reviewing the current setup...')
          streamArtifact(writer, serializeProjectBlueprint(projectBlueprintFromDraft(progressDraft), 'yaml'), true)
        }

        const classifierStartedAt = Date.now()
        const usedDeterministicClassifier = shouldUseDeterministicBuilderTurnClassification(deterministicPreflight)
        const turnClassification = usedDeterministicClassifier
          ? deterministicPreflight
          : await classifyBuilderTurnWithAI({
              prompt: sanitizedPrompt,
              draft: body.draft,
              recentMessages: (body.messages ?? []).slice(-6).map((message) => ({
                role: message.role,
                text: extractTextFromMessage(message),
              })),
            })

        logBuilderTelemetry('[builder:chat-route]', {
          orgId,
          hasDraft: Boolean(body.draft),
          preferredMode: body.preferred_mode ?? 'auto',
          runtimeMode: body.runtime_mode ?? null,
          messageChars: sanitizedPrompt.length,
          turnType: turnClassification.type,
          turnReason: turnClassification.reason,
          turnTopic: turnClassification.topic ?? null,
          turnConfidence: turnClassification.confidence ?? null,
          classifierSource: usedDeterministicClassifier ? 'deterministic' : 'ai',
          classifier_ms: Date.now() - classifierStartedAt,
          total_ms: Date.now() - requestStartedAt,
        })

        const needsBuilderModels = turnClassification.type === 'config_change' || turnClassification.type === 'clarification_answer'
        const modelResolutionStartedAt = Date.now()
        const models = needsBuilderModels
          ? await resolveProjectBuilderModels(orgId, requestedModelId)
          : null

        if (models) {
          logBuilderTelemetry('[builder:chat-route]', {
            orgId,
            phase: 'model-resolution',
            requestedModelId,
            modelResolution_ms: Date.now() - modelResolutionStartedAt,
            total_ms: Date.now() - requestStartedAt,
          })
        }

        if (turnClassification.type !== 'config_change' && turnClassification.type !== 'clarification_answer') {
          const availableUnifiedSkills = body.available_unified_skills
            ?? (body.draft ? await getUnifiedSkillsForOrg({ orgId }) : [])
          const textPartId = crypto.randomUUID()
          const metaReply = await generateProjectBuilderAnswer({
            prompt: sanitizedPrompt,
            draft: body.draft,
            classification: turnClassification,
            availableUnifiedSkills,
          })
          logBuilderTelemetry('[builder:chat-route]', {
            orgId,
            phase: 'answer-only',
            turnType: turnClassification.type,
            messageChars: sanitizedPrompt.length,
          })
          writer.write({ type: 'text-start', id: textPartId })
          for (const chunk of chunkText(metaReply, 48)) {
            if (!chunk) continue
            writer.write({
              type: 'text-delta',
              id: textPartId,
              delta: chunk,
            })
          }
          writer.write({ type: 'text-end', id: textPartId })
          return
        }

        try {
          const progressStatus = buildProjectBuilderStreamingPreamble({
            prompt: sanitizedPrompt,
            isInitial,
          }).trim()
          if (progressStatus) {
            writeProgress(progressStatus)
          }
        } catch {
          // Progress preview is best-effort only; final result remains authoritative.
        }

        const turnStartedAt = Date.now()
        writeProgress(isInitial ? 'Choosing the likely setup...' : 'Reviewing the current setup...')
        const { result } = await runProjectBuilderTurn({
          orgId,
          prompt: sanitizedPrompt,
          draft: body.draft,
          selectedTemplateSlug: body.selected_template_slug,
          preferredMode: body.preferred_mode,
          runtimeMode: body.runtime_mode,
          availableUnifiedSkills: body.available_unified_skills,
          requestedModelId,
          telemetry: {
            userId,
            orgId,
          },
          resolvedModels: models ?? undefined,
        })
        logBuilderTelemetry('[builder:chat-route]', {
          orgId,
          phase: 'runProjectBuilderTurn',
          duration_ms: Date.now() - turnStartedAt,
          total_ms: Date.now() - requestStartedAt,
          mode: result.mode,
        })
        writeProgress('Preparing the next step...', result.draft)

        const skillsStartedAt = Date.now()
        const availableUnifiedSkills = body.available_unified_skills
          ?? await getUnifiedSkillsForOrg({ orgId })
        const { decisionCards } = buildBuilderActionCatalog({
          result,
          availableUnifiedSkills,
        })
        const assistantMessage = buildProjectBuilderAssistantMessage({
          prompt: sanitizedPrompt,
          result,
          isInitial,
        })
        logBuilderTelemetry('[builder:chat-route]', {
          orgId,
          phase: 'decision-catalog',
          skills_ms: Date.now() - skillsStartedAt,
          skillsSource: body.available_unified_skills ? 'request' : 'database',
          decisionCardKinds: decisionCards.map((card) => card.kind),
          suggestedIntegrations: result.suggested_integrations,
          projectName: result.draft.project.name,
          topTemplate: result.template_matches[0]?.slug ?? null,
          assistantMessageChars: assistantMessage.length,
        })

        const streamData = projectBuilderStreamDataSchema.parse({
          follow_up_question: buildProjectBuilderFollowUpQuestion({
            prompt: sanitizedPrompt,
            result,
          }),
          result,
          decision_cards: decisionCards,
          stage_hint: deriveBuilderStage({
            result,
            decisionCards,
          }) ?? 'create-agent',
        })

        streamArtifact(writer, serializeProjectBlueprint(result.blueprint, 'yaml'), true)
        writer.write({
          type: 'data-builder-result',
          data: streamData,
        })

        const textPartId = crypto.randomUUID()
        writer.write({ type: 'text-start', id: textPartId })
        for (const chunk of chunkText(assistantMessage, 48)) {
          if (!chunk) continue
          writer.write({
            type: 'text-delta',
            id: textPartId,
            delta: chunk,
          })
        }
        writer.write({ type: 'text-end', id: textPartId })
        const internalTotalMs = Date.now() - requestStartedAt
        logBuilderTelemetry('[builder:chat-route]', {
          orgId,
          phase: 'complete',
          total_ms: internalTotalMs,
        })
        logBuilderTelemetry('[builder:chat-metric]', {
          orgId,
          route: '/api/orgs/[id]/blueprints/chat',
          status: 'success',
          mode: result.mode,
          auth_ms: preflightTimings.auth_ms,
          access_ms: preflightTimings.access_ms,
          access_source: requestContext.timings.access_source,
          classifier_source: usedDeterministicClassifier ? 'deterministic' : 'ai',
          builder_internal_ms: internalTotalMs,
        })

        const idemKey = req.headers.get('x-idempotency-key') || crypto.randomUUID()
        incrementUsage(orgId, 'ai_queries_monthly', 1, `builder-chat:${orgId}:${idemKey}`).catch(() => {})
        recordAIGenerationEvent({
          userId,
          prompt: sanitizedPrompt,
          success: true,
          feature: 'project-builder-chat',
        }).catch((error: unknown) => {
          ErrorService.captureException(error as Error, {
            severity: 'warning',
            context: { userId, orgId, modelId: models?.modelId ?? requestedModelId, operation: 'recordAIGeneration' },
            tags: { layer: 'api', route: 'blueprints-chat' },
          })
        })
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'Failed to chat with project builder'
        logBuilderError('[builder:chat-route] stream failed', error, { orgId })
        ErrorService.captureException(error as Error, {
          severity: 'error',
          context: { endpoint: '/api/orgs/[id]/blueprints/chat', method: 'POST', orgId },
          tags: { layer: 'api', route: 'blueprints-chat-stream' },
        })
        return message
      },
      originalMessages: body.messages as ProjectBuilderUIMessage[] | undefined,
    })

    return createUIMessageStreamResponse({
      stream,
      headers: buildBuilderChatTimingHeaders(preflightTimings, requestContext.timings.access_source),
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }

    const message = error instanceof Error ? error.message : 'Failed to chat with project builder'
    console.error('[blueprints/chat] Request failed:', error)
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/blueprints/chat', method: 'POST' },
      tags: { layer: 'api', route: 'blueprints-chat' },
    })
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === 'development' ? message : 'Failed to chat with project builder',
      },
      { status: 500 },
    )
  }
})

function buildBuilderChatTimingHeaders(
  timings: BuilderChatPreflightTimings,
  accessSource: string,
): HeadersInit {
  return {
    'Server-Timing': [
      `auth;dur=${timings.auth_ms}`,
      `access;dur=${timings.access_ms};desc="${accessSource}"`,
      `body;dur=${timings.body_ms}`,
      `rate_limit;dur=${timings.rateLimit_ms}`,
      `entitlement;dur=${timings.entitlement_ms}`,
      `preflight;dur=${timings.total_ms}`,
    ].join(', '),
    'X-Lucid-Builder-Preflight-Ms': String(timings.total_ms),
    'X-Lucid-Builder-Access-Source': accessSource,
  }
}

function extractLatestUserMessage(messages?: UIMessage[]): string | null {
  if (!Array.isArray(messages)) return null
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  if (!lastUserMessage) return null

  const text = extractTextFromMessage(lastUserMessage)

  return text || null
}

function extractTextFromMessage(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => ('text' in part ? part.text : ''))
    .join('')
    .trim()
}

function chunkText(value: string, size: number): string[] {
  const chunks: string[] = []
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size))
  }
  return chunks.length > 0 ? chunks : ['']
}

function streamArtifact(
  writer: {
    write: (part: {
      type: 'data-builder-artifact'
      data: { format: 'yaml'; chunk: string; reset: boolean }
      transient?: boolean
    }) => void
  },
  artifact: string,
  reset: boolean,
) {
  const chunks = chunkText(artifact, 48)
  chunks.forEach((chunk, index) => {
    writer.write({
      type: 'data-builder-artifact',
      data: projectBuilderArtifactSchema.parse({
        format: 'yaml',
        chunk,
        reset: reset && index === 0,
      }),
      transient: true,
    })
  })
}
