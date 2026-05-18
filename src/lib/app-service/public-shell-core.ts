import type { PublicAppCapability, PublicAppConfig } from '@contracts/app-runtime'
import { sanitizeGeneratedAppManifest } from './manifest-sanitizer'
import { publicCommerceConfigForManifest } from './public-commerce-core'

export interface PublicShellBlock {
  id: string
  type: string
  enabled: boolean
  props: Record<string, unknown>
}

export interface PublicShellPage {
  path: string
  title: string
  blocks: PublicShellBlock[]
}

export interface PublicShellTheme {
  mode: 'light' | 'dark' | 'system'
  primary_color?: string
  accent_color?: string
  font_family?: string
  radius: 'none' | 'sm' | 'md'
}

export interface PublicShellManifest {
  name: string
  slug: string
  description: string | null
  audience: string | null
  outcome: string | null
  theme: PublicShellTheme
  pages: PublicShellPage[]
  capabilities: PublicAppCapability[]
  commerce: PublicAppConfig['commerce']
  consent: PublicAppConfig['consent']
  marketplace: {
    creator_attribution?: string
    demo_prompts: string[]
    tags: string[]
  }
}

const DEFAULT_THEME: PublicShellTheme = {
  mode: 'system',
  radius: 'sm',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function normalizeTheme(value: unknown): PublicShellTheme {
  const theme = isRecord(value) ? value : {}
  const mode = theme.mode === 'light' || theme.mode === 'dark' || theme.mode === 'system'
    ? theme.mode
    : DEFAULT_THEME.mode
  const radius = theme.radius === 'none' || theme.radius === 'sm' || theme.radius === 'md'
    ? theme.radius
    : DEFAULT_THEME.radius

  return {
    mode,
    radius,
    ...(typeof theme.primary_color === 'string' ? { primary_color: theme.primary_color } : {}),
    ...(typeof theme.accent_color === 'string' ? { accent_color: theme.accent_color } : {}),
    ...(typeof theme.font_family === 'string' ? { font_family: theme.font_family } : {}),
  }
}

function normalizeCapabilities(value: unknown): PublicAppCapability[] {
  const allowed = new Set<PublicAppCapability>([
    'chat',
    'lead',
    'feedback',
    'status',
    'uploads',
    'public_actions',
    'paid_actions',
  ])
  const capabilities = stringArray(value).filter((item): item is PublicAppCapability => allowed.has(item as PublicAppCapability))
  return capabilities.length > 0 ? [...new Set(capabilities)] : ['status']
}

function normalizeBlock(value: unknown, fallbackIndex: number): PublicShellBlock | null {
  if (!isRecord(value)) return null
  const type = stringValue(value.type)
  if (!type) return null
  const id = stringValue(value.id) ?? `${type}-${fallbackIndex}`

  return {
    id,
    type,
    enabled: value.enabled !== false,
    props: isRecord(value.props) ? value.props : {},
  }
}

function defaultBlocks(capabilities: PublicAppCapability[]): PublicShellBlock[] {
  const blocks: PublicShellBlock[] = [
    { id: 'hero', type: 'hero', enabled: true, props: {} },
    { id: 'summary', type: 'service_summary', enabled: true, props: {} },
  ]

  if (capabilities.includes('chat')) {
    blocks.push({ id: 'demo', type: 'demo_chat', enabled: true, props: {} })
  }

  if (capabilities.includes('lead')) {
    blocks.push({ id: 'lead', type: 'lead_form', enabled: true, props: {} })
  }

  blocks.push({ id: 'proof', type: 'proof_metrics', enabled: true, props: {} })
  return blocks
}

function normalizePages(value: unknown, appName: string, capabilities: PublicAppCapability[]): PublicShellPage[] {
  if (!Array.isArray(value)) {
    return [{ path: '/', title: appName, blocks: defaultBlocks(capabilities) }]
  }

  const pages = value.map((page, pageIndex): PublicShellPage | null => {
    if (!isRecord(page)) return null
    const title = stringValue(page.title) ?? appName
    const path = stringValue(page.path) ?? '/'
    const blocks = Array.isArray(page.blocks)
      ? page.blocks
        .map((block, blockIndex) => normalizeBlock(block, blockIndex))
        .filter((block): block is PublicShellBlock => Boolean(block))
      : []

    return {
      path,
      title,
      blocks: blocks.length > 0 ? blocks : defaultBlocks(capabilities),
    }
  }).filter((page): page is PublicShellPage => Boolean(page))

  return pages.length > 0 ? pages : [{ path: '/', title: appName, blocks: defaultBlocks(capabilities) }]
}

function normalizeConsent(value: unknown): PublicAppConfig['consent'] {
  if (!isRecord(value)) return {}
  return {
    ...(typeof value.privacy_url === 'string' ? { privacy_url: value.privacy_url } : {}),
    ...(typeof value.terms_url === 'string' ? { terms_url: value.terms_url } : {}),
    ...(typeof value.transcript_retention_days === 'number' ? { transcript_retention_days: value.transcript_retention_days } : {}),
  }
}

function normalizeMarketplace(value: unknown): PublicShellManifest['marketplace'] {
  if (!isRecord(value)) return { demo_prompts: [], tags: [] }
  return {
    ...(typeof value.creator_attribution === 'string' ? { creator_attribution: value.creator_attribution } : {}),
    demo_prompts: stringArray(value.demo_prompts),
    tags: stringArray(value.tags),
  }
}

export function normalizePublicShellManifest(
  manifest: Record<string, unknown> | null | undefined,
  fallback: {
    name: string
    slug: string
  },
): PublicShellManifest {
  const source = sanitizeGeneratedAppManifest(manifest, fallback)
  const name = stringValue(source.name) ?? fallback.name
  const slug = stringValue(source.slug) ?? fallback.slug
  const capabilities = normalizeCapabilities(source.capabilities)

  return {
    name,
    slug,
    description: stringValue(source.description),
    audience: stringValue(source.audience),
    outcome: stringValue(source.outcome),
    theme: normalizeTheme(source.theme),
    pages: normalizePages(source.pages, name, capabilities),
    capabilities,
    commerce: publicCommerceConfigForManifest(source),
    consent: normalizeConsent(source.consent),
    marketplace: normalizeMarketplace(source.marketplace),
  }
}

export function getPrimaryShellPage(manifest: PublicShellManifest): PublicShellPage {
  return manifest.pages.find((page) => page.path === '/') ?? manifest.pages[0]!
}
