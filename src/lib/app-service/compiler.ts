import { createHash } from 'node:crypto'
import {
  AppServiceSpecSchema,
  type AppDeploymentTarget,
  type AppServiceSpec,
} from '@contracts/app-service'
import { sanitizeGeneratedAppManifest } from './manifest-sanitizer'
import { recordAppServiceMetric, withAppServiceSpan } from './observability'
import { APP_SERVICE_DEFAULT_TRANSCRIPT_RETENTION_DAYS } from './product-policy-core'
import {
  assertAppServicePromptInjectionReviewPassed,
  reviewAppServiceSpecForPromptInjection,
} from './prompt-injection-review-core'

export interface CompiledAppDeploymentPlan {
  name: string
  slug: string
  frontendStrategy: 'manifest' | 'generated_code' | 'external'
  deploymentTarget: AppDeploymentTarget
  frontendManifest: Record<string, unknown>
  assistantIds: string[]
  crewId: string | null
  dagIds: string[]
  templateDeploymentIds: string[]
  checksum: string
}

type AppFrontendPage = AppServiceSpec['frontend']['pages'][number]
type AppFrontendBlock = AppFrontendPage['blocks'][number]

function manifestBlock(
  id: string,
  type: AppFrontendBlock['type'],
  props: Record<string, unknown> = {},
): AppFrontendBlock {
  return { id, type, enabled: true, props }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function checksum(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function defaultBlocks(spec: AppServiceSpec): AppFrontendBlock[] {
  const chatEnabled = spec.agents.some((agent) => agent.public_chat_enabled) || spec.team?.public_chat_enabled
  const blocks: AppFrontendBlock[] = [
    manifestBlock('hero', 'hero', { title: spec.name, outcome: spec.outcome }),
    manifestBlock('summary', 'service_summary', { description: spec.description }),
  ]

  if (chatEnabled) blocks.push(manifestBlock('demo', 'demo_chat'))

  blocks.push(
    manifestBlock('lead', 'lead_form'),
    manifestBlock('proof', 'proof_metrics'),
  )

  return blocks
}

function compilePages(spec: AppServiceSpec): AppFrontendPage[] {
  if (spec.frontend.pages.length > 0) {
    return spec.frontend.pages
  }

  return [
    {
      path: '/',
      title: spec.name,
      blocks: defaultBlocks(spec),
    },
  ]
}

function compileCapabilities(spec: AppServiceSpec) {
  const capabilities = new Set(['status'])
  const blocks = compilePages(spec).flatMap((page) => page.blocks)

  if (spec.agents.some((agent) => agent.public_chat_enabled) || spec.team?.public_chat_enabled) {
    capabilities.add('chat')
  }
  if (blocks.some((block) => block.enabled && ['lead_form', 'intake_form'].includes(block.type))) {
    capabilities.add('lead')
  }
  if (spec.workflows.some((workflow) => workflow.trigger === 'public_action')) {
    capabilities.add('public_actions')
  }
  if (
    Object.keys(spec.commerce?.paid_actions ?? {}).length > 0
    || spec.workflows.some((workflow) => workflow.trigger === 'public_action' && workflow.commerce && workflow.commerce.mode !== 'off')
  ) {
    capabilities.add('public_actions')
    capabilities.add('paid_actions')
  }

  capabilities.add('feedback')
  return [...capabilities].sort()
}

export function compileAppServiceSpec(spec: AppServiceSpec): CompiledAppDeploymentPlan {
  return withAppServiceSpan('app_service.compiler.compile', {
    stage: 'compiler',
    operation: 'compileAppServiceSpec',
    slug: spec.slug,
  }, () => {
    const parsed = AppServiceSpecSchema.parse(spec)
    assertAppServicePromptInjectionReviewPassed(reviewAppServiceSpecForPromptInjection(parsed))
    const pages = compilePages(parsed)
    const capabilities = compileCapabilities(parsed)
    const rawFrontendManifest = {
      schema_version: parsed.schema_version,
      kind: parsed.kind,
      name: parsed.name,
      slug: parsed.slug,
      description: parsed.description,
      category: parsed.category,
      audience: parsed.audience,
      outcome: parsed.outcome,
      theme: parsed.frontend.theme,
      pages,
      required_states: parsed.frontend.required_states,
      capabilities,
      public_api: {
        base_path: `/api/app-runtime/v1/public/apps/${parsed.slug}`,
        sdk_package: '@lucid/app-runtime-sdk',
      },
      commerce: parsed.commerce ?? { paid_actions: {} },
      agents: parsed.agents.map((agent) => ({
        key: agent.key,
        role: agent.role,
        public_chat_enabled: agent.public_chat_enabled,
        memory_policy: agent.memory_policy,
        assistant_id: agent.assistant_id ?? null,
        template_id: agent.template_id ?? null,
      })),
      team: parsed.team
        ? {
          key: parsed.team.key,
          public_chat_enabled: parsed.team.public_chat_enabled,
          crew_id: parsed.team.crew_id ?? null,
          template_id: parsed.team.template_id ?? null,
        }
        : null,
      workflows: parsed.workflows.map((workflow) => ({
        key: workflow.key,
        name: workflow.name,
        trigger: workflow.trigger,
        public_action_key: workflow.public_action_key ?? null,
        workflow_id: workflow.workflow_id ?? null,
        dag_id: workflow.dag_id ?? null,
        commerce: workflow.commerce ?? null,
      })),
      integrations: parsed.integrations.map((integration) => ({
        provider: integration.provider,
        label: integration.label,
        required: integration.required,
        purpose: integration.purpose ?? null,
      })),
      consent: {
        transcript_retention_days: APP_SERVICE_DEFAULT_TRANSCRIPT_RETENTION_DAYS,
      },
      marketplace: parsed.marketplace,
    }
    const frontendManifest = sanitizeGeneratedAppManifest(rawFrontendManifest, {
      name: parsed.name,
      slug: parsed.slug,
    })

    recordAppServiceMetric('generation_compiler_manifest_compiled', 1, {
      stage: 'compiler',
      operation: 'compileAppServiceSpec',
      slug: parsed.slug,
    }, {
      frontend_strategy: parsed.frontend.strategy,
      deployment_target: parsed.deployment.default_target,
      agent_count: parsed.agents.length,
      workflow_count: parsed.workflows.length,
      integration_count: parsed.integrations.length,
      capability_count: capabilities.length,
    })

    return {
      name: parsed.name,
      slug: parsed.slug,
      frontendStrategy: parsed.frontend.strategy,
      deploymentTarget: parsed.deployment.default_target,
      frontendManifest,
      assistantIds: parsed.agents.flatMap((agent) => agent.assistant_id ? [agent.assistant_id] : []),
      crewId: parsed.team?.crew_id ?? null,
      dagIds: parsed.workflows.flatMap((workflow) => workflow.dag_id ? [workflow.dag_id] : []),
      templateDeploymentIds: [],
      checksum: checksum(frontendManifest),
    }
  })
}
