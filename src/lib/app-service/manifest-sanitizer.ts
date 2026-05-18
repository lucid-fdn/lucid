import type { PublicAppCapability } from '@contracts/app-runtime'
import { normalizePublicActionCommerceConfig } from './public-commerce-core'
import {
  containsAppServiceSecret,
  redactAppServiceText,
  redactAppServiceValue,
} from './security-redaction'
import { APP_SERVICE_DEFAULT_TRANSCRIPT_RETENTION_DAYS } from './product-policy-core'

const MAX_ARRAY_ITEMS = 50
const MAX_OBJECT_KEYS = 80
const MAX_STRING_LENGTH = 4_000
const MAX_DEPTH = 6

const FORBIDDEN_KEY_PATTERN = /(^|[_-])(api[_-]?key|assistant[_-]?id|authorization|bearer|client[_-]?secret|cookie|credential|crew[_-]?id|dag[_-]?id|env|headers?|jwt|oauth|org(?:anization)?[_-]?id|password|private[_-]?(?:key|memory)|prompt|provider[_-]?(?:key|refs?)|refresh[_-]?token|runtime[_-]?config|secret|service[_-]?role|session|system[_-]?prompt|token|workflow[_-]?id)([_-]|$)/i
const DANGEROUS_KEY_PATTERN = /^(dangerouslySetInnerHTML|html|innerHTML|on[A-Z].*|script|srcDoc|style|className)$/i

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'schema_version',
  'kind',
  'name',
  'slug',
  'description',
  'category',
  'audience',
  'outcome',
  'theme',
  'pages',
  'required_states',
  'capabilities',
  'public_api',
  'commerce',
  'agents',
  'team',
  'workflows',
  'integrations',
  'marketplace',
  'consent',
  'limits',
])

const ALLOWED_CAPABILITIES = new Set<PublicAppCapability>([
  'chat',
  'lead',
  'feedback',
  'status',
  'uploads',
  'public_actions',
  'paid_actions',
])

const ALLOWED_BLOCK_TYPES = new Set([
  'hero',
  'service_summary',
  'demo_chat',
  'lead_form',
  'intake_form',
  'faq',
  'proof_metrics',
  'creator_attribution',
  'pricing_cta',
  'embed_widget',
  'owner_cockpit',
  'agentops_panel',
])

const ALLOWED_REQUIRED_STATES = new Set([
  'loading',
  'empty',
  'error',
  'setup_required',
  'rate_limited',
  'agent_paused',
  'maintenance',
])

const ALLOWED_LIMITS = new Set([
  'public_requests_per_day',
  'chat_turns_per_session',
  'max_upload_mb',
  'monthly_cost_cents',
  'public_app_requests_per_minute',
  'public_org_requests_per_minute',
  'public_ip_requests_per_minute',
  'public_session_requests_per_minute',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanString(value: unknown, max = MAX_STRING_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = redactAppServiceText(value).replace(/[\u0000-\u001F\u007F]/g, '').trim()
  return text ? text.slice(0, max) : undefined
}

function cleanStringArray(value: unknown, maxItems = MAX_ARRAY_ITEMS, maxLength = 200): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => cleanString(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems)
}

function cleanPublicUrl(value: unknown, options: { relative?: boolean; mailto?: boolean } = {}): string | undefined {
  const text = cleanString(value, 2_000)
  if (!text) return undefined
  if (options.relative && text.startsWith('/') && !text.startsWith('//')) return text
  if (text === '#') return text

  try {
    const url = new URL(text)
    if (url.protocol === 'https:' || url.protocol === 'http:' || (options.mailto && url.protocol === 'mailto:')) {
      return url.toString()
    }
  } catch {
    return undefined
  }

  return undefined
}

function hasForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEY_PATTERN.test(key) || DANGEROUS_KEY_PATTERN.test(key)
}

function sanitizeArbitraryValue(value: unknown, depth = 0, key?: string): unknown {
  if (key && hasForbiddenKey(key)) return undefined
  if (depth > MAX_DEPTH) return undefined

  if (typeof value === 'string') {
    if (/href|url|uri|link/i.test(key ?? '')) {
      return cleanPublicUrl(value, { relative: true, mailto: true })
    }
    return cleanString(value)
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }

  if (typeof value === 'boolean' || value === null) return value

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeArbitraryValue(item, depth + 1))
      .filter((item) => item !== undefined)
  }

  if (!isRecord(value)) return undefined

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_OBJECT_KEYS)
      .flatMap(([entryKey, entryValue]) => {
        if (hasForbiddenKey(entryKey)) return []
        const sanitized = sanitizeArbitraryValue(redactAppServiceValue(entryValue), depth + 1, entryKey)
        return sanitized === undefined ? [] : [[entryKey, sanitized]]
      }),
  )
}

function sanitizeTheme(value: unknown) {
  const theme = isRecord(value) ? value : {}
  const mode = theme.mode === 'light' || theme.mode === 'dark' || theme.mode === 'system'
    ? theme.mode
    : 'system'
  const radius = theme.radius === 'none' || theme.radius === 'sm' || theme.radius === 'md'
    ? theme.radius
    : 'sm'
  const color = (input: unknown) => {
    const text = cleanString(input, 32)
    return text && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(text) ? text : undefined
  }
  const fontFamily = cleanString(theme.font_family, 120)

  return {
    mode,
    radius,
    ...(color(theme.primary_color) ? { primary_color: color(theme.primary_color) } : {}),
    ...(color(theme.accent_color) ? { accent_color: color(theme.accent_color) } : {}),
    ...(fontFamily && !/url\(|<|>|javascript:/i.test(fontFamily) ? { font_family: fontFamily } : {}),
  }
}

function sanitizeBlock(value: unknown, index: number) {
  if (!isRecord(value)) return null
  const type = cleanString(value.type, 80)
  if (!type || !ALLOWED_BLOCK_TYPES.has(type)) return null
  const id = cleanString(value.id, 80) ?? `${type}-${index}`
  const props = sanitizeArbitraryValue(value.props, 0, 'props')

  return {
    id,
    type,
    enabled: value.enabled !== false,
    props: isRecord(props) ? props : {},
  }
}

function sanitizePages(value: unknown, fallbackName: string) {
  if (!Array.isArray(value)) return []

  return value
    .slice(0, 20)
    .flatMap((page, pageIndex) => {
      if (!isRecord(page)) return []
      const path = cleanPublicUrl(page.path, { relative: true }) ?? '/'
      const title = cleanString(page.title, 120) ?? fallbackName
      const blocks = Array.isArray(page.blocks)
        ? page.blocks
          .map((block, blockIndex) => sanitizeBlock(block, blockIndex))
          .filter((block): block is NonNullable<ReturnType<typeof sanitizeBlock>> => Boolean(block))
        : []

      return [{
        path,
        title,
        blocks,
      }]
    })
}

function sanitizeCapabilities(value: unknown): PublicAppCapability[] {
  const capabilities = cleanStringArray(value, 20, 80)
    .filter((item): item is PublicAppCapability => ALLOWED_CAPABILITIES.has(item as PublicAppCapability))
  return capabilities.length > 0 ? [...new Set(capabilities)] : ['status']
}

function sanitizePublicApi(value: unknown, slug: string) {
  const api = isRecord(value) ? value : {}
  const basePath = cleanString(api.base_path, 200)
  const safeBasePath = basePath?.startsWith('/api/app-runtime/v1/public/apps/')
    ? basePath
    : `/api/app-runtime/v1/public/apps/${slug}`

  return {
    base_path: safeBasePath,
    sdk_package: '@lucid/app-runtime-sdk',
  }
}

function sanitizeAgents(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).flatMap((agent) => {
    if (!isRecord(agent)) return []
    const key = cleanString(agent.key, 80)
    if (!key) return []
    return [{
      key,
      role: cleanString(agent.role, 120) ?? 'Agent',
      public_chat_enabled: agent.public_chat_enabled === true,
      memory_policy: agent.memory_policy === 'visitor_scoped' || agent.memory_policy === 'disabled'
        ? agent.memory_policy
        : 'private',
    }]
  })
}

function sanitizeTeam(value: unknown) {
  if (!isRecord(value)) return null
  const key = cleanString(value.key, 80)
  if (!key) return null
  return {
    key,
    public_chat_enabled: value.public_chat_enabled === true,
  }
}

function sanitizeWorkflows(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 30).flatMap((workflow) => {
    if (!isRecord(workflow)) return []
    const key = cleanString(workflow.key, 80)
    const name = cleanString(workflow.name, 120)
    if (!key || !name) return []
    const trigger = workflow.trigger === 'public_action' ? 'public_action' : 'manual'
    const commerce = sanitizePublicActionCommerceConfig(workflow.commerce)
    return [{
      key,
      name,
      trigger,
      ...(trigger === 'public_action' && cleanString(workflow.public_action_key, 80)
        ? { public_action_key: cleanString(workflow.public_action_key, 80) }
        : {}),
      ...(trigger === 'public_action' && commerce ? { commerce } : {}),
    }]
  })
}

function cleanCommerceIdentifier(value: unknown, max = 120): string | undefined {
  const text = cleanString(value, max)
  if (!text || text.includes('[redacted]')) return undefined
  return /^[a-z0-9_.:-]+$/i.test(text) ? text : undefined
}

function sanitizeCommerceAmount(value: unknown) {
  if (!isRecord(value)) return undefined
  const amount = typeof value.amount === 'number' && Number.isFinite(value.amount) && value.amount > 0
    ? Math.floor(value.amount)
    : undefined
  const currency = cleanCommerceIdentifier(value.currency, 12)
  return amount && currency ? { amount, currency } : undefined
}

function sanitizePublicActionCommerceConfig(value: unknown) {
  if (!isRecord(value)) return null
  const mode = value.mode === 'shadow' || value.mode === 'enforce' ? value.mode : 'off'
  const refundPolicy = value.refund_policy === 'none'
    || value.refund_policy === 'manual_review'
    || value.refund_policy === 'provider_supported'
    ? value.refund_policy
    : 'manual_review'
  const resourceType = value.resource_type === 'generated_app_api' || value.resource_type === 'mcp_resource'
    ? value.resource_type
    : 'generated_app_action'

  const amount = sanitizeCommerceAmount(value.amount)
  const provider = cleanCommerceIdentifier(value.provider)
  const rail = cleanCommerceIdentifier(value.rail)
  const resourceId = cleanCommerceIdentifier(value.resource_id, 240)
  const label = cleanString(value.label, 120)
  const description = cleanString(value.description, 500)
  const freeQuota = typeof value.free_quota_per_session === 'number'
    && Number.isInteger(value.free_quota_per_session)
    && value.free_quota_per_session >= 0
    && value.free_quota_per_session <= 1_000
    ? value.free_quota_per_session
    : undefined

  return normalizePublicActionCommerceConfig({
    mode,
    ...(amount ? { amount } : {}),
    ...(provider ? { provider } : {}),
    ...(rail ? { rail } : {}),
    resource_type: resourceType,
    ...(resourceId ? { resource_id: resourceId } : {}),
    ...(label ? { label } : {}),
    ...(description ? { description } : {}),
    ...(freeQuota !== undefined ? { free_quota_per_session: freeQuota } : {}),
    refund_policy: refundPolicy,
  })
}

function sanitizeCommerce(value: unknown) {
  const commerce = isRecord(value) ? value : {}
  const paidActions = isRecord(commerce.paid_actions) ? commerce.paid_actions : {}

  return {
    paid_actions: Object.fromEntries(
      Object.entries(paidActions)
        .slice(0, 50)
        .flatMap(([key, entry]) => {
          const action = cleanCommerceIdentifier(key, 80)
          const config = sanitizePublicActionCommerceConfig(entry)
          return action && config ? [[action, config]] : []
        }),
    ),
  }
}

function sanitizeIntegrations(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 30).flatMap((integration) => {
    if (!isRecord(integration)) return []
    const provider = cleanString(integration.provider, 80)
    const label = cleanString(integration.label, 120)
    if (!provider || !label) return []
    return [{
      provider,
      label,
      required: integration.required === true,
      ...(cleanString(integration.purpose, 500) ? { purpose: cleanString(integration.purpose, 500) } : {}),
    }]
  })
}

function sanitizeMarketplace(value: unknown) {
  const marketplace = isRecord(value) ? value : {}
  return {
    tags: cleanStringArray(marketplace.tags, 20, 80),
    demo_prompts: cleanStringArray(marketplace.demo_prompts, 10, 500),
    proof_page_enabled: marketplace.proof_page_enabled !== false,
    ...(cleanString(marketplace.creator_attribution, 160) ? { creator_attribution: cleanString(marketplace.creator_attribution, 160) } : {}),
  }
}

function sanitizeConsent(value: unknown) {
  const consent = isRecord(value) ? value : {}
  const retention = typeof consent.transcript_retention_days === 'number'
    && Number.isInteger(consent.transcript_retention_days)
    && consent.transcript_retention_days >= 0
    && consent.transcript_retention_days <= 3650
    ? consent.transcript_retention_days
    : undefined

  return {
    ...(cleanPublicUrl(consent.privacy_url) ? { privacy_url: cleanPublicUrl(consent.privacy_url) } : {}),
    ...(cleanPublicUrl(consent.terms_url) ? { terms_url: cleanPublicUrl(consent.terms_url) } : {}),
    transcript_retention_days: retention ?? APP_SERVICE_DEFAULT_TRANSCRIPT_RETENTION_DAYS,
  }
}

function sanitizeLimits(value: unknown) {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entry]) => ALLOWED_LIMITS.has(key) && typeof entry === 'number' && Number.isFinite(entry) && entry >= 0)
      .map(([key, entry]) => [key, Math.floor(entry as number)]),
  )
}

export function sanitizeGeneratedAppManifest(
  manifest: Record<string, unknown> | null | undefined,
  fallback: { name: string; slug: string },
): Record<string, unknown> {
  const source = isRecord(manifest) ? manifest : {}
  const allowedSource = Object.fromEntries(
    Object.entries(source).filter(([key]) => ALLOWED_TOP_LEVEL_KEYS.has(key)),
  )
  const name = cleanString(allowedSource.name, 120) ?? fallback.name
  const slug = cleanString(allowedSource.slug, 120) ?? fallback.slug
  const commerce = sanitizeCommerce(allowedSource.commerce)
  const workflows = sanitizeWorkflows(allowedSource.workflows)
  const hasPaidActions = Object.keys(commerce.paid_actions).length > 0
    || workflows.some((workflow) => isRecord(workflow) && isRecord(workflow.commerce))
  const capabilities = hasPaidActions
    ? [...new Set([...sanitizeCapabilities(allowedSource.capabilities), 'public_actions' as const, 'paid_actions' as const])]
    : sanitizeCapabilities(allowedSource.capabilities)
  const pages = sanitizePages(allowedSource.pages, name)

  return {
    schema_version: cleanString(allowedSource.schema_version, 20) ?? '1.0',
    kind: 'app_service',
    name,
    slug,
    ...(cleanString(allowedSource.description, 1_000) ? { description: cleanString(allowedSource.description, 1_000) } : {}),
    ...(cleanString(allowedSource.category, 80) ? { category: cleanString(allowedSource.category, 80) } : {}),
    ...(cleanString(allowedSource.audience, 500) ? { audience: cleanString(allowedSource.audience, 500) } : {}),
    ...(cleanString(allowedSource.outcome, 500) ? { outcome: cleanString(allowedSource.outcome, 500) } : {}),
    theme: sanitizeTheme(allowedSource.theme),
    pages,
    required_states: cleanStringArray(allowedSource.required_states, 20, 80)
      .filter((item) => ALLOWED_REQUIRED_STATES.has(item)),
    capabilities,
    public_api: sanitizePublicApi(allowedSource.public_api, slug),
    commerce,
    agents: sanitizeAgents(allowedSource.agents),
    team: sanitizeTeam(allowedSource.team),
    workflows,
    integrations: sanitizeIntegrations(allowedSource.integrations),
    marketplace: sanitizeMarketplace(allowedSource.marketplace),
    consent: sanitizeConsent(allowedSource.consent),
    limits: sanitizeLimits(allowedSource.limits),
  }
}

function valueContainsDisallowedData(value: unknown, key?: string, depth = 0): boolean {
  if (key && hasForbiddenKey(key)) return true
  if (depth > MAX_DEPTH) return false

  if (typeof value === 'string') {
    if (containsAppServiceSecret(value)) return true
    if (/href|url|uri|link/i.test(key ?? '')) {
      return Boolean(cleanString(value)) && cleanPublicUrl(value, { relative: true, mailto: true }) === undefined
    }
    return false
  }

  if (Array.isArray(value)) {
    return value.some((item) => valueContainsDisallowedData(item, undefined, depth + 1))
  }

  if (!isRecord(value)) return false

  return Object.entries(value).some(([entryKey, entryValue]) => (
    valueContainsDisallowedData(entryValue, entryKey, depth + 1)
  ))
}

export function manifestContainsDisallowedData(manifest: Record<string, unknown>): boolean {
  return valueContainsDisallowedData(manifest)
}
