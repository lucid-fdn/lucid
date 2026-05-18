import { z } from 'zod'
import {
  AppFrontendBlockSchema,
  AppServiceSpecSchema,
  type AppServiceSpec,
} from '@contracts/app-service'

export const APP_SERVICE_REQUIRED_BETA_ORG_COUNT = 10

export const APP_SERVICE_BETA_ACCESS_MODES = ['off', 'enforce'] as const
export type AppServiceBetaAccessMode = (typeof APP_SERVICE_BETA_ACCESS_MODES)[number]

export const APP_SERVICE_BILLING_MODES = ['off', 'meter', 'enforce'] as const
export type AppServiceBillingMode = (typeof APP_SERVICE_BILLING_MODES)[number]

export type AppServiceBillingPlan = 'starter' | 'pro' | 'business'

export type AppServiceBillingAction =
  | 'create_generation_run'
  | 'approve_preview'
  | 'launch_v0_frontend'
  | 'launch_vercel_deployment'
  | 'publish_public_app'

export interface AppServiceBillingEntitlement {
  action: AppServiceBillingAction
  metric: string
  kind: 'quota' | 'capacity'
  label: string
  limits: Record<AppServiceBillingPlan, number>
}

export interface AppServiceEntitlementDecision {
  action: AppServiceBillingAction
  metric: string
  kind: 'quota' | 'capacity'
  label: string
  plan: AppServiceBillingPlan
  current: number
  increment: number
  limit: number
  allowed: boolean
  unlimited: boolean
  remaining: number | null
}

export interface AppServiceLaunchReadinessInput {
  dogfoodBlueprintCount: number
  betaAllowlistCount: number
  betaDocsPublished: boolean
  changelogPublished: boolean
  feedbackCaptureEnabled: boolean
  killSwitchConfigured: boolean
  billingEntitlementsConfigured: boolean
  analyticsEventCount: number
  postDeployChecklistCount: number
  proofPageCount: number
}

export interface AppServiceLaunchReadinessReport {
  ready: boolean
  blockers: string[]
  warnings: string[]
}

type AppServiceSpecInput = z.input<typeof AppServiceSpecSchema>
type AppFrontendBlockInput = z.input<typeof AppFrontendBlockSchema>

const DEFAULT_RUNTIME = {
  frontend_target: 'lucid_manifest' as const,
  app_runtime_api_target: 'shared_lucid_next' as const,
  agent_runtime_target: 'shared_worker' as const,
  generation_runtime_target: 'shared_appgen_worker' as const,
}

function appSpec(input: AppServiceSpecInput): AppServiceSpec {
  return AppServiceSpecSchema.parse(input)
}

function manifestPage(
  title: string,
  blocks: AppFrontendBlockInput[],
) {
  return { path: '/', title, blocks }
}

export const APP_SERVICE_DOGFOOD_BLUEPRINTS = [
  appSpec({
    schema_version: '1.0',
    kind: 'app_service',
    name: 'Support Concierge',
    slug: 'support-concierge',
    description: 'A public support assistant that answers product questions, captures escalation context, and routes qualified cases to the right owner.',
    category: 'support',
    audience: 'Prospects and customers who need support before opening a human ticket.',
    outcome: 'Resolve common questions instantly and hand off high-intent issues with complete context.',
    frontend: {
      strategy: 'manifest',
      theme: { mode: 'light', primary_color: '#0f766e', accent_color: '#f59e0b', radius: 'sm' },
      pages: [manifestPage('Support Concierge', [
        { id: 'hero', type: 'hero', props: { headline: 'Support Concierge', cta: 'Ask the assistant' } },
        { id: 'summary', type: 'service_summary', props: { promise: 'Instant answers with human escalation when needed.' } },
        { id: 'chat', type: 'demo_chat', props: { starter: 'Can you help me pick the right plan?' } },
        { id: 'lead', type: 'lead_form', props: { intent: 'support_escalation' } },
        { id: 'proof', type: 'proof_metrics', props: { metrics: ['median_first_reply', 'deflection_rate'] } },
      ])],
      required_states: ['loading', 'error', 'setup_required', 'rate_limited', 'agent_paused'],
    },
    agents: [{
      key: 'support_agent',
      role: 'Support triage and knowledge answerer',
      public_chat_enabled: true,
      memory_policy: 'visitor_scoped',
    }],
    workflows: [{
      key: 'support_escalation',
      name: 'Support escalation',
      trigger: 'public_action',
      public_action_key: 'escalate_support_case',
      input_schema: { type: 'object', required: ['summary'] },
    }],
    integrations: [{
      provider: 'zendesk',
      label: 'Zendesk',
      required: false,
      purpose: 'Create support tickets when the visitor asks for a human.',
      tools: ['create_ticket'],
    }],
    secrets: [{
      key: 'SUPPORT_ESCALATION_EMAIL',
      label: 'Support escalation inbox',
      target: 'lucid_server',
      required: false,
    }],
    channels: [{
      channel_type: 'web_chat',
      required: true,
      setup_note: 'Public web chat is served through the generated app runtime.',
    }],
    deployment: {
      default_target: 'lucid_hosted',
      allowed_targets: ['lucid_hosted', 'vercel'],
      runtime: DEFAULT_RUNTIME,
    },
    eval_pack: [],
    marketplace: {
      tags: ['support', 'customer-success', 'web-chat'],
      demo_prompts: ['What plan should I use?', 'I need help with billing.'],
      creator_attribution: 'Lucid App Foundry',
      proof_page_enabled: true,
    },
  }),
  appSpec({
    schema_version: '1.0',
    kind: 'app_service',
    name: 'Sales Qualifier',
    slug: 'sales-qualifier',
    description: 'A revenue assistant that qualifies inbound visitors, captures buying intent, and produces clean handoff notes for sales teams.',
    category: 'sales',
    audience: 'Website visitors evaluating a B2B offer.',
    outcome: 'Convert more high-intent visitors into qualified pipeline without adding form friction.',
    frontend: {
      strategy: 'manifest',
      theme: { mode: 'system', primary_color: '#2563eb', accent_color: '#10b981', radius: 'sm' },
      pages: [manifestPage('Sales Qualifier', [
        { id: 'hero', type: 'hero', props: { headline: 'Sales Qualifier', cta: 'Qualify my need' } },
        { id: 'summary', type: 'service_summary', props: { promise: 'Visitor intent captured as sales-ready context.' } },
        { id: 'chat', type: 'demo_chat', props: { starter: 'I want to understand pricing for my team.' } },
        { id: 'lead', type: 'lead_form', props: { intent: 'sales_qualified_lead' } },
        { id: 'cta', type: 'pricing_cta', props: { label: 'Book a follow-up' } },
      ])],
      required_states: ['loading', 'empty', 'error', 'rate_limited', 'setup_required'],
    },
    agents: [{
      key: 'qualifier',
      role: 'Sales discovery and qualification',
      public_chat_enabled: true,
      memory_policy: 'visitor_scoped',
    }],
    integrations: [{
      provider: 'hubspot',
      label: 'HubSpot',
      required: false,
      purpose: 'Create or update qualified contacts and deals.',
      tools: ['upsert_contact', 'create_deal'],
    }],
    channels: [{
      channel_type: 'web_chat',
      required: true,
      setup_note: 'Public web chat qualifies visitors before CRM handoff.',
    }],
    deployment: {
      default_target: 'lucid_hosted',
      allowed_targets: ['lucid_hosted', 'vercel'],
      runtime: DEFAULT_RUNTIME,
    },
    eval_pack: [],
    marketplace: {
      tags: ['sales', 'lead-generation', 'crm'],
      demo_prompts: ['Do you integrate with Salesforce?', 'Can I talk to sales?'],
      creator_attribution: 'Lucid App Foundry',
      proof_page_enabled: true,
    },
  }),
  appSpec({
    schema_version: '1.0',
    kind: 'app_service',
    name: 'Onboarding Copilot',
    slug: 'onboarding-copilot',
    description: 'A guided onboarding assistant that answers setup questions, checks progress, and nudges users through activation milestones.',
    category: 'ops',
    audience: 'New users and customer success teams running onboarding playbooks.',
    outcome: 'Increase activation by turning setup guidance into a measurable public service.',
    frontend: {
      strategy: 'manifest',
      theme: { mode: 'light', primary_color: '#7c3aed', accent_color: '#14b8a6', radius: 'sm' },
      pages: [manifestPage('Onboarding Copilot', [
        { id: 'hero', type: 'hero', props: { headline: 'Onboarding Copilot', cta: 'Start setup' } },
        { id: 'summary', type: 'service_summary', props: { promise: 'Step-by-step setup with progress-aware help.' } },
        { id: 'chat', type: 'demo_chat', props: { starter: 'What should I configure first?' } },
        { id: 'faq', type: 'faq', props: { topic: 'activation' } },
        { id: 'proof', type: 'proof_metrics', props: { metrics: ['activation_rate', 'time_to_first_value'] } },
      ])],
      required_states: ['loading', 'empty', 'error', 'setup_required', 'agent_paused'],
    },
    agents: [{
      key: 'onboarding_agent',
      role: 'Activation guidance and setup troubleshooting',
      public_chat_enabled: true,
      memory_policy: 'visitor_scoped',
    }],
    workflows: [{
      key: 'activation_check',
      name: 'Activation check',
      trigger: 'public_action',
      public_action_key: 'check_activation',
      input_schema: { type: 'object', properties: { account_id: { type: 'string' } } },
    }],
    channels: [{
      channel_type: 'web_chat',
      required: true,
      setup_note: 'Public web chat guides new users through onboarding milestones.',
    }],
    deployment: {
      default_target: 'lucid_hosted',
      allowed_targets: ['lucid_hosted', 'vercel'],
      runtime: DEFAULT_RUNTIME,
    },
    eval_pack: [],
    marketplace: {
      tags: ['onboarding', 'customer-success', 'activation'],
      demo_prompts: ['How do I invite my team?', 'What is blocking activation?'],
      creator_attribution: 'Lucid App Foundry',
      proof_page_enabled: true,
    },
  }),
  appSpec({
    schema_version: '1.0',
    kind: 'app_service',
    name: 'Compliance Intake',
    slug: 'compliance-intake',
    description: 'A controlled intake assistant that collects structured compliance requests, explains policy boundaries, and escalates sensitive cases.',
    category: 'ops',
    audience: 'Employees, partners, or customers submitting compliance and policy questions.',
    outcome: 'Reduce back-and-forth while preserving auditability and human review for sensitive requests.',
    frontend: {
      strategy: 'manifest',
      theme: { mode: 'system', primary_color: '#334155', accent_color: '#22c55e', radius: 'sm' },
      pages: [manifestPage('Compliance Intake', [
        { id: 'hero', type: 'hero', props: { headline: 'Compliance Intake', cta: 'Submit request' } },
        { id: 'summary', type: 'service_summary', props: { promise: 'Structured intake with approval-aware escalation.' } },
        { id: 'intake', type: 'intake_form', props: { intent: 'compliance_request' } },
        { id: 'faq', type: 'faq', props: { topic: 'policy' } },
        { id: 'attribution', type: 'creator_attribution', props: { label: 'Built on Lucid governance' } },
      ])],
      required_states: ['loading', 'error', 'setup_required', 'maintenance'],
    },
    agents: [{
      key: 'policy_agent',
      role: 'Policy explanation and compliance triage',
      public_chat_enabled: false,
      memory_policy: 'private',
    }],
    workflows: [{
      key: 'human_review',
      name: 'Compliance human review',
      trigger: 'public_action',
      public_action_key: 'submit_compliance_request',
      input_schema: { type: 'object', required: ['request_type', 'summary'] },
    }],
    secrets: [{
      key: 'COMPLIANCE_REVIEW_CHANNEL',
      label: 'Compliance review channel',
      target: 'lucid_server',
      required: false,
    }],
    deployment: {
      default_target: 'lucid_hosted',
      allowed_targets: ['lucid_hosted'],
      runtime: DEFAULT_RUNTIME,
    },
    eval_pack: [],
    marketplace: {
      tags: ['compliance', 'governance', 'intake'],
      demo_prompts: ['I need a vendor security review.', 'Where should this policy request go?'],
      creator_attribution: 'Lucid App Foundry',
      proof_page_enabled: true,
    },
  }),
  appSpec({
    schema_version: '1.0',
    kind: 'app_service',
    name: 'Research Analyst',
    slug: 'research-analyst',
    description: 'A knowledge assistant that turns a curated knowledge base into a public research service with safe answers and source-aware follow-up.',
    category: 'knowledge',
    audience: 'Visitors, customers, and internal teams researching a focused domain.',
    outcome: 'Make trusted knowledge discoverable as a branded AI service.',
    frontend: {
      strategy: 'manifest',
      theme: { mode: 'light', primary_color: '#0891b2', accent_color: '#db2777', radius: 'sm' },
      pages: [manifestPage('Research Analyst', [
        { id: 'hero', type: 'hero', props: { headline: 'Research Analyst', cta: 'Ask a question' } },
        { id: 'summary', type: 'service_summary', props: { promise: 'Source-aware answers from approved knowledge.' } },
        { id: 'chat', type: 'demo_chat', props: { starter: 'Summarize the latest product research.' } },
        { id: 'proof', type: 'proof_metrics', props: { metrics: ['answered_questions', 'source_coverage'] } },
        { id: 'faq', type: 'faq', props: { topic: 'research' } },
      ])],
      required_states: ['loading', 'empty', 'error', 'setup_required', 'rate_limited'],
    },
    agents: [{
      key: 'research_agent',
      role: 'Knowledge retrieval and cited synthesis',
      public_chat_enabled: true,
      memory_policy: 'visitor_scoped',
    }],
    integrations: [{
      provider: 'notion',
      label: 'Notion',
      required: false,
      purpose: 'Read approved research pages and knowledge base material.',
      scopes: ['read'],
      tools: ['search_pages'],
    }],
    channels: [{
      channel_type: 'web_chat',
      required: true,
      setup_note: 'Public web chat answers from approved research knowledge.',
    }],
    deployment: {
      default_target: 'lucid_hosted',
      allowed_targets: ['lucid_hosted', 'vercel'],
      runtime: DEFAULT_RUNTIME,
    },
    eval_pack: [],
    marketplace: {
      tags: ['knowledge', 'research', 'documentation'],
      demo_prompts: ['What changed in the latest release?', 'Summarize the implementation notes.'],
      creator_attribution: 'Lucid App Foundry',
      proof_page_enabled: true,
    },
  }),
] satisfies AppServiceSpec[]

export const APP_SERVICE_BILLING_ENTITLEMENTS = [
  {
    action: 'create_generation_run',
    metric: 'app_service_generations_monthly',
    kind: 'quota',
    label: 'App generations',
    limits: { starter: 0, pro: 25, business: -1 },
  },
  {
    action: 'approve_preview',
    metric: 'app_service_lucid_previews_monthly',
    kind: 'quota',
    label: 'Lucid-hosted previews',
    limits: { starter: 0, pro: 25, business: -1 },
  },
  {
    action: 'launch_v0_frontend',
    metric: 'app_service_v0_frontends_monthly',
    kind: 'quota',
    label: 'v0 frontend generations',
    limits: { starter: 0, pro: 10, business: -1 },
  },
  {
    action: 'launch_vercel_deployment',
    metric: 'app_service_vercel_deployments_monthly',
    kind: 'quota',
    label: 'Vercel deployments',
    limits: { starter: 0, pro: 5, business: -1 },
  },
  {
    action: 'publish_public_app',
    metric: 'app_service_public_apps',
    kind: 'capacity',
    label: 'Public generated apps',
    limits: { starter: 0, pro: 3, business: -1 },
  },
] as const satisfies readonly AppServiceBillingEntitlement[]

export const APP_SERVICE_POST_DEPLOY_ONBOARDING_CHECKLIST = [
  { key: 'connect_runtime', label: 'Connect the assistant, team, workflow, and integration bindings.' },
  { key: 'review_guardrails', label: 'Review public runtime limits, consent URLs, and abuse controls.' },
  { key: 'launch_v0_preview', label: 'Launch or refresh the generated v0/Vercel frontend.' },
  { key: 'verify_sandbox', label: 'Confirm generated source validation, sandbox build, and deployment receipt.' },
  { key: 'configure_origins', label: 'Add external Vercel origins to the generated-app allowlist.' },
  { key: 'test_public_paths', label: 'Smoke config, chat, lead, feedback, and public action endpoints.' },
  { key: 'verify_agentops', label: 'Confirm AgentOps traces and operator summary are visible.' },
  { key: 'publish_proof_page', label: 'Publish the proof page with metrics, ownership, and rollback owner.' },
  { key: 'capture_feedback_owner', label: 'Assign a beta feedback owner and escalation channel.' },
  { key: 'schedule_beta_review', label: 'Schedule weekly beta review for conversion, cost, quality, and abuse.' },
] as const

export const APP_SERVICE_TEMPLATE_PROOF_PAGES = APP_SERVICE_DOGFOOD_BLUEPRINTS.map((blueprint) => ({
  slug: blueprint.slug,
  title: `${blueprint.name} Proof`,
  path: `/apps/${blueprint.slug}`,
  requiredBlocks: ['hero', 'service_summary', 'proof_metrics', 'creator_attribution'],
}))

export const APP_SERVICE_ANALYTICS_EVENTS = [
  'app_service_beta_access_allowed',
  'app_service_beta_access_denied',
  'app_service_entitlement_allowed',
  'app_service_entitlement_denied',
  'app_service_generation_requested',
  'app_service_generation_approved',
  'app_service_v0_launch_requested',
  'app_service_vercel_launch_requested',
  'app_service_public_app_published',
  'app_service_beta_feedback_submitted',
] as const

export type AppServiceAnalyticsEventName = (typeof APP_SERVICE_ANALYTICS_EVENTS)[number]

export const APP_SERVICE_BETA_DOC_PATHS = [
  'docs/superpowers/reference/app-service-beta-launch.md',
  'docs/superpowers/runbooks/app-service-foundry-beta-promotion.md',
] as const

export const APP_SERVICE_PUBLIC_CHANGELOG_ENTRY = '2026-04-29-app-service-foundry-beta'

export const AppServiceBetaFeedbackInputSchema = z.object({
  category: z.enum([
    'generation_quality',
    'runtime_api',
    'v0_vercel_launch',
    'operator_cockpit',
    'docs',
    'billing',
    'other',
  ]).default('other'),
  sentiment: z.enum(['love', 'works', 'blocked']).default('works'),
  message: z.string().trim().min(1).max(2_000),
  email: z.string().trim().email().max(254).optional(),
  source: z.enum(['operator_cockpit', 'post_deploy_checklist', 'docs']).default('operator_cockpit'),
})

export type AppServiceBetaFeedbackInput = z.infer<typeof AppServiceBetaFeedbackInputSchema>

export function parseAppServiceCsv(value?: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function parseAppServiceBetaAccessMode(value?: string | null): AppServiceBetaAccessMode {
  return value === 'enforce' ? 'enforce' : 'off'
}

export function parseAppServiceBillingMode(value?: string | null): AppServiceBillingMode {
  if (value === 'meter' || value === 'enforce') return value
  return 'off'
}

export function isValidAppServiceBetaAccessMode(value: string): value is AppServiceBetaAccessMode {
  return APP_SERVICE_BETA_ACCESS_MODES.includes(value as AppServiceBetaAccessMode)
}

export function isValidAppServiceBillingMode(value: string): value is AppServiceBillingMode {
  return APP_SERVICE_BILLING_MODES.includes(value as AppServiceBillingMode)
}

export function isOrgAllowedForAppServiceBeta(orgId: string, env: Record<string, string | undefined> = process.env): boolean {
  if (parseAppServiceBetaAccessMode(env.APP_SERVICE_BETA_ACCESS_MODE) === 'off') return true
  const allowlist = parseAppServiceCsv(env.APP_SERVICE_BETA_ORG_ALLOWLIST)
  return allowlist.includes('*') || allowlist.includes(orgId)
}

export function isOrgBypassedForAppServiceBilling(orgId: string, env: Record<string, string | undefined> = process.env): boolean {
  const bypassList = parseAppServiceCsv(env.APP_SERVICE_BILLING_BYPASS_ORGS)
  return bypassList.includes('*') || bypassList.includes(orgId)
}

export function betaAllowlistCount(env: Record<string, string | undefined> = process.env): number {
  const allowlist = parseAppServiceCsv(env.APP_SERVICE_BETA_ORG_ALLOWLIST)
  return allowlist.includes('*') ? APP_SERVICE_REQUIRED_BETA_ORG_COUNT : allowlist.length
}

export function getAppServiceBillingEntitlement(action: AppServiceBillingAction): AppServiceBillingEntitlement {
  const entitlement = APP_SERVICE_BILLING_ENTITLEMENTS.find((item) => item.action === action)
  if (!entitlement) {
    throw new Error(`Unknown App Service billing action: ${action}`)
  }
  return entitlement
}

export function evaluateAppServiceEntitlement(input: {
  action: AppServiceBillingAction
  plan: AppServiceBillingPlan
  current: number
  increment?: number
}): AppServiceEntitlementDecision {
  const entitlement = getAppServiceBillingEntitlement(input.action)
  const increment = Math.max(1, Math.trunc(input.increment ?? 1))
  const current = Math.max(0, Math.trunc(input.current))
  const limit = entitlement.limits[input.plan]
  const unlimited = limit < 0
  const nextUsage = current + increment
  const allowed = unlimited || nextUsage <= limit

  return {
    action: entitlement.action,
    metric: entitlement.metric,
    kind: entitlement.kind,
    label: entitlement.label,
    plan: input.plan,
    current,
    increment,
    limit,
    allowed,
    unlimited,
    remaining: unlimited ? null : Math.max(0, limit - nextUsage),
  }
}

export function evaluateAppServiceLaunchReadiness(
  input: AppServiceLaunchReadinessInput,
): AppServiceLaunchReadinessReport {
  const blockers: string[] = []
  const warnings: string[] = []

  if (input.dogfoodBlueprintCount < APP_SERVICE_DOGFOOD_BLUEPRINTS.length) {
    blockers.push('dogfood_blueprints_missing')
  }
  if (input.betaAllowlistCount < APP_SERVICE_REQUIRED_BETA_ORG_COUNT) {
    blockers.push('beta_allowlist_too_small')
  }
  if (!input.betaDocsPublished) blockers.push('beta_docs_missing')
  if (!input.changelogPublished) blockers.push('public_changelog_missing')
  if (!input.feedbackCaptureEnabled) blockers.push('feedback_capture_missing')
  if (!input.killSwitchConfigured) blockers.push('kill_switch_missing')
  if (!input.billingEntitlementsConfigured) blockers.push('billing_entitlements_missing')
  if (input.analyticsEventCount < APP_SERVICE_ANALYTICS_EVENTS.length) {
    blockers.push('analytics_events_missing')
  }
  if (input.postDeployChecklistCount < APP_SERVICE_POST_DEPLOY_ONBOARDING_CHECKLIST.length) {
    blockers.push('post_deploy_checklist_incomplete')
  }
  if (input.proofPageCount < APP_SERVICE_TEMPLATE_PROOF_PAGES.length) {
    warnings.push('template_proof_pages_incomplete')
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
  }
}
