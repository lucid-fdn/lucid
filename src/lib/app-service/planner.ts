import 'server-only'

import { generateText, Output } from 'ai'
import { AppPlannerResultSchema, type AppPlannerResult } from '@contracts/app-service'
import { getAITelemetry } from '@/lib/ai/telemetry'
import { getLucidModel, isLucidConfigured } from '@/lib/ai/providers'
import { DEFAULT_MODEL_ID } from '@/lib/ai/models'
import { ErrorService } from '@/lib/errors/error-service'
import { AppServiceError } from './errors'
import { APP_SERVICE_PLANNER_MAX_OUTPUT_TOKENS } from './load-cost-core'
import {
  appServiceErrorContext,
  recordAppServiceMetric,
  withAppServiceSpan,
} from './observability'
import {
  PLANNER_SYSTEM_PROMPT,
  PlanAppServiceInputSchema,
  buildPlannerPrompt,
  createDeterministicAppServicePlan,
  planInputFromGenerationRun,
  type PlanAppServiceInput,
} from './planner-core'

export {
  PLANNER_SYSTEM_PROMPT,
  PlanAppServiceInputSchema,
  buildPlannerPrompt,
  createDeterministicAppServicePlan,
  planInputFromGenerationRun,
}

export type { PlanAppServiceInput }

function resolvePlannerMaxOutputTokens(): number {
  const configured = Number.parseInt(process.env.APP_SERVICE_PLANNER_MAX_OUTPUT_TOKENS ?? '', 10)
  if (Number.isInteger(configured) && configured >= 512) {
    return Math.min(configured, APP_SERVICE_PLANNER_MAX_OUTPUT_TOKENS)
  }
  return APP_SERVICE_PLANNER_MAX_OUTPUT_TOKENS
}

function resolvePlannerMode(input: PlanAppServiceInput): 'ai' | 'deterministic' {
  if (input.mode) return input.mode
  if (process.env.APP_SERVICE_PLANNER_MODE === 'deterministic') return 'deterministic'
  if (!isLucidConfigured()) return 'deterministic'
  return 'ai'
}

export async function planAppService(input: PlanAppServiceInput): Promise<AppPlannerResult> {
  const parsed = PlanAppServiceInputSchema.parse(input)
  const mode = resolvePlannerMode(parsed)

  return withAppServiceSpan('app_service.planner.plan', {
    stage: 'planner',
    operation: 'planAppService',
    orgId: parsed.orgId,
    projectId: parsed.projectId,
  }, async () => {
    recordAppServiceMetric('generation_planner_started', 1, {
      stage: 'planner',
      operation: 'planAppService',
      orgId: parsed.orgId,
      projectId: parsed.projectId,
    }, {
      mode,
    })

    if (parsed.blueprintSlug) {
      recordAppServiceMetric('generation_planner_platform_blueprint', 1, {
        stage: 'planner',
        operation: 'planAppService',
        orgId: parsed.orgId,
        projectId: parsed.projectId,
      }, {
        blueprint_slug: parsed.blueprintSlug,
      })
      return createDeterministicAppServicePlan(parsed)
    }

    if (mode === 'deterministic') {
      recordAppServiceMetric('generation_planner_deterministic', 1, {
        stage: 'planner',
        operation: 'planAppService',
        orgId: parsed.orgId,
        projectId: parsed.projectId,
      })
      return createDeterministicAppServicePlan(parsed)
    }

    const modelId = parsed.modelId || process.env.APP_SERVICE_PLANNER_MODEL || DEFAULT_MODEL_ID

    try {
      const result = await generateText({
        model: getLucidModel(modelId),
        system: PLANNER_SYSTEM_PROMPT,
        prompt: buildPlannerPrompt(parsed),
        output: Output.object({
          name: 'AppServicePlannerResult',
          description: 'A production-ready Lucid App Service Foundry specification.',
          schema: AppPlannerResultSchema,
        }),
        temperature: 0.2,
        maxOutputTokens: resolvePlannerMaxOutputTokens(),
        experimental_telemetry: getAITelemetry({
          orgId: parsed.orgId,
          modelId,
          feature: 'app-service-planner',
          metadata: {
            ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
            stage: 'planner',
          },
        }),
      })

      recordAppServiceMetric('generation_planner_ai_completed', 1, {
        stage: 'planner',
        operation: 'planAppService',
        orgId: parsed.orgId,
        projectId: parsed.projectId,
      })

      return AppPlannerResultSchema.parse(result.output)
    } catch (error) {
      ErrorService.captureException(error as Error, {
        severity: 'error',
        ...appServiceErrorContext('planAppService', {
          stage: 'planner',
          orgId: parsed.orgId,
          projectId: parsed.projectId,
        }, {
          mode,
          modelId,
        }),
      })

      if (process.env.APP_SERVICE_PLANNER_FALLBACK_DETERMINISTIC === 'false') {
        throw new AppServiceError('provider_unavailable', 'App service planner model is unavailable.', 503, {
          retryable: true,
        })
      }

      recordAppServiceMetric('generation_planner_ai_fallback', 1, {
        stage: 'planner',
        operation: 'planAppService',
        orgId: parsed.orgId,
        projectId: parsed.projectId,
      })
      return createDeterministicAppServicePlan(parsed)
    }
  })
}
