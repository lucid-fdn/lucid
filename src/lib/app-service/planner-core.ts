import { z } from 'zod'
import {
  AppPlannerResultSchema,
  AppServiceSpecSchema,
  type AppGenerationRun,
  type AppServiceCategory,
  type AppPlannerResult,
  type AppServiceSpec,
} from '@contracts/app-service'
import { buildPlatformBlueprintPlannerResult } from './platform-blueprints-core'
import { reviewPlannerPromptForPromptInjection } from './prompt-injection-review-core'

export const PlanAppServiceInputSchema = z.object({
  prompt: z.string().min(1).max(20_000),
  orgId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  preferredName: z.string().max(120).optional(),
  preferredSlug: z.string().max(120).optional(),
  category: z.enum(['support', 'sales', 'content', 'ops', 'knowledge', 'custom']).optional(),
  audience: z.string().max(500).optional(),
  outcome: z.string().max(500).optional(),
  blueprintSlug: z.string().max(120).regex(/^[a-z0-9-]+$/).optional(),
  modelId: z.string().max(160).optional(),
  mode: z.enum(['ai', 'deterministic']).optional(),
})

export type PlanAppServiceInput = z.infer<typeof PlanAppServiceInputSchema>

export const PLANNER_SYSTEM_PROMPT = `
You are Lucid App Foundry's senior product architect.
Create a production-ready AI agent service specification, not a generic website.

Hard rules:
- Return only data matching the schema.
- The app must be a useful AI service with agent(s), runtime API capabilities, and a public service UI.
- Use Lucid-hosted manifest deployment by default.
- Never include real secrets, provider keys, OAuth tokens, or private memory.
- Keep generated app frontend requirements compatible with the Lucid App Runtime API and @lucid/app-runtime-sdk.
- Prefer one strong default agent unless a team is clearly needed.
- Include lead capture, feedback, status, setup-required, loading, and error states unless inappropriate.
- Use short lowercase kebab-case slugs.
- Public chat should be enabled only when the prompt implies a visitor-facing assistant.
`.trim()

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80) || 'ai-service'
}

function titleFromPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(/\s+/g, ' ')
    .replace(/^(build|create|generate|make)\s+(an?\s+)?/i, '')
    .trim()

  const short = cleaned.split(/[.?!]/)[0]?.trim() || 'AI Service'
  return short
    .split(' ')
    .slice(0, 6)
    .join(' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function inferCategory(prompt: string): AppServiceCategory {
  const lower = prompt.toLowerCase()
  if (/(support|ticket|helpdesk|customer|faq)/.test(lower)) return 'support'
  if (/(sales|lead|sdr|prospect|crm|pipeline)/.test(lower)) return 'sales'
  if (/(content|social|blog|video|newsletter|campaign)/.test(lower)) return 'content'
  if (/(ops|monitor|incident|report|alert|backoffice)/.test(lower)) return 'ops'
  if (/(knowledge|wiki|docs|internal|search|policy)/.test(lower)) return 'knowledge'
  return 'custom'
}

export function createDeterministicAppServicePlan(input: PlanAppServiceInput): AppPlannerResult {
  const parsed = PlanAppServiceInputSchema.parse(input)
  if (parsed.blueprintSlug) {
    const blueprintResult = buildPlatformBlueprintPlannerResult(parsed.blueprintSlug)
    if (blueprintResult) return AppPlannerResultSchema.parse(blueprintResult)
  }

  const name = parsed.preferredName?.trim() || titleFromPrompt(parsed.prompt)
  const category = parsed.category ?? inferCategory(parsed.prompt)
  const slug = slugify(parsed.preferredSlug || name)
  const audience = parsed.audience || 'People who need this AI service from a simple web app.'
  const outcome = parsed.outcome || 'Deliver a useful answer, collect the right context, and route follow-up work.'
  const publicChatEnabled = !/(internal only|backoffice only|private)/i.test(parsed.prompt)
  const promptInjectionReview = reviewPlannerPromptForPromptInjection(parsed.prompt)

  const spec: AppServiceSpec = AppServiceSpecSchema.parse({
    schema_version: '1.0',
    kind: 'app_service',
    name,
    slug,
    description: parsed.prompt.slice(0, 900),
    category,
    audience,
    outcome,
    frontend: {
      strategy: 'manifest',
      theme: { mode: 'system', radius: 'sm' },
      pages: [
        {
          path: '/',
          title: name,
          blocks: [
            { id: 'hero', type: 'hero', enabled: true, props: { title: name, outcome } },
            { id: 'summary', type: 'service_summary', enabled: true, props: { description: parsed.prompt } },
            ...(publicChatEnabled
              ? [{ id: 'demo', type: 'demo_chat', enabled: true, props: {} }]
              : []),
            { id: 'lead', type: 'lead_form', enabled: true, props: {} },
            { id: 'proof', type: 'proof_metrics', enabled: true, props: {} },
          ],
        },
      ],
      required_states: ['loading', 'empty', 'error', 'setup_required', 'rate_limited', 'agent_paused'],
    },
    agents: [
      {
        key: 'primary',
        role: `${name} Agent`,
        public_chat_enabled: publicChatEnabled,
        memory_policy: publicChatEnabled ? 'visitor_scoped' : 'private',
        template: {
          kind: 'agent',
          system_prompt: `You are the ${name} agent. Your job is to ${outcome} Keep responses concise, useful, and operationally grounded.`,
          memory_enabled: publicChatEnabled,
          memory_strategy: publicChatEnabled ? 'conservative' : 'off',
          cost_limit_per_run_usd: 0.25,
          channel_hints: [
            {
              channel_type: 'web',
              required: true,
              setup_note: 'Use the generated app public runtime API for visitor interactions.',
            },
          ],
          eval_pack: [
            {
              name: 'Helpful first response',
              prompt: 'A visitor asks what this service can do.',
              expected_behaviors: ['Explains the service clearly', 'Asks for useful context', 'Does not invent unavailable integrations'],
            },
          ],
        },
      },
    ],
    workflows: [
      {
        key: 'follow_up',
        name: 'Follow-up routing',
        trigger: 'public_action',
        public_action_key: 'request_follow_up',
        input_schema: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    ],
    integrations: [],
    secrets: [],
    deployment: {
      default_target: 'lucid_hosted',
      allowed_targets: ['lucid_hosted', 'vercel'],
      runtime: {
        frontend_target: 'lucid_manifest',
        app_runtime_api_target: 'shared_lucid_next',
        agent_runtime_target: 'shared_worker',
        generation_runtime_target: 'shared_appgen_worker',
      },
    },
    marketplace: {
      tags: [category, 'app-foundry'],
      demo_prompts: ['What can this service help me with?', 'How do I get started?'],
      proof_page_enabled: true,
    },
  })

  return AppPlannerResultSchema.parse({
    spec,
    reasoning: 'Generated deterministically from the user prompt so the App Service pipeline can be exercised without an external model call.',
    assumptions: [audience, outcome],
    risks: [
      'Generated integrations are placeholders until the user connects real providers.',
      ...promptInjectionReview.findings.map((finding) => `Prompt-injection review: ${finding.message}`),
    ],
    recommended_next_steps: [
      'Review the service copy.',
      'Approve the manifest preview.',
      'Connect required integrations before publishing.',
      ...(promptInjectionReview.passed ? [] : ['Review and remove suspicious tool or integration instructions before publishing.']),
    ],
  })
}

export function buildPlannerPrompt(input: PlanAppServiceInput): string {
  return JSON.stringify({
    user_prompt: input.prompt,
    preferred_name: input.preferredName,
    preferred_slug: input.preferredSlug,
    category_hint: input.category,
    audience_hint: input.audience,
    outcome_hint: input.outcome,
    platform_blueprint_slug: input.blueprintSlug,
    platform_defaults: {
      frontend_target: 'lucid_manifest',
      app_runtime_api_target: 'shared_lucid_next',
      agent_runtime_target: 'shared_worker',
      generation_runtime_target: 'shared_appgen_worker',
      sdk_package: '@lucid/app-runtime-sdk',
    },
  }, null, 2)
}

export function planInputFromGenerationRun(run: AppGenerationRun): PlanAppServiceInput {
  const raw = run.input
  return PlanAppServiceInputSchema.parse({
    prompt: run.prompt,
    orgId: run.org_id,
    projectId: run.project_id,
    preferredName: typeof raw.preferredName === 'string' ? raw.preferredName : undefined,
    preferredSlug: typeof raw.preferredSlug === 'string' ? raw.preferredSlug : undefined,
    category: typeof raw.category === 'string' ? raw.category : undefined,
    audience: typeof raw.audience === 'string' ? raw.audience : undefined,
    outcome: typeof raw.outcome === 'string' ? raw.outcome : undefined,
    blueprintSlug: typeof raw.platformBlueprintSlug === 'string' ? raw.platformBlueprintSlug : undefined,
    modelId: typeof raw.modelId === 'string' ? raw.modelId : undefined,
    mode: typeof raw.mode === 'string' ? raw.mode : undefined,
  })
}
