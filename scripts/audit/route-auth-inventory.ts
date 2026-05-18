import path from 'node:path'

import type { AuditFinding, RouteInventoryItem } from './audit-types'
import { createFinding, readText, walkFiles } from './audit-utils'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const PUBLIC_ROUTE_ALLOWLIST = [
  /^\/api\/health$/,
  /^\/api\/ready$/,
  /^\/api\/webhooks\//,
  /^\/api\/auth\//,
  /^\/api\/oauth\//,
  /^\/api\/public\//,
  /^\/api\/docs\//,
  /^\/api\/contact$/,
  /^\/api\/subscribe$/,
  /^\/api\/waitlist/,
  /^\/api\/waitinglist$/,
  /^\/api\/newsletter/,
  /^\/api\/content/,
  /^\/api\/images\//,
  /^\/api\/company\/:slug\/info$/,
]

export async function buildRouteAuthInventory(root: string): Promise<{
  items: RouteInventoryItem[]
  findings: AuditFinding[]
}> {
  const files = await walkFiles(root, {
    includeExtensions: ['route.ts', 'route.tsx'],
    includeGlobs: [/^src\/app\/api\/.*\/route\.tsx?$/],
  })
  const items: RouteInventoryItem[] = []
  const findings: AuditFinding[] = []

  for (const file of files) {
    const source = await readText(root, file)
    const item = inspectRoute(file, source)
    items.push(item)
    findings.push(...findRouteIssues(item))
  }

  return { items, findings }
}

export function inspectRoute(file: string, source: string): RouteInventoryItem {
  const methods = [...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)]
    .map((match) => match[1])
  const routePath = routePathFromFile(file)
  const hasCsrf = /\bwithCSRF\b|csrf/i.test(source)
  const hasSessionAuth =
    /getServerSession|getServerAuth|getUserId|requireUser|requireServerAuth|requireAuth|authenticateUser|currentUser|privy|require[A-Za-z0-9_]*Access/i.test(source)
  const hasOrgContext = /requireOrgRequestContext|requireOrg|orgId|workspace.*member|assert.*permission/i.test(source)
  const hasInternalSecret = /WORKER_TRIGGER_SECRET|INTERNAL_SERVICE_SECRET|BROWSER_QA_CONTROL_TOKEN|CRON_SECRET|TEST_AI_ROUTE_SECRET|authenticateRuntime|verifyInternalAuth|verifyAgentCommerceInternalAuth|timingSafeEqual|authorization.*Bearer|Bearer/i.test(source)
  const hasWebhookSignature = /signature|webhook.*secret|verify.*signature|verifyTelegramMiniAppInitData|svix|stripe.*constructEvent|x-hub-signature|discord.*signature/i.test(source)
  const hasRateLimit = /rateLimit|check.*RateLimit|limitRequest|withRateLimit/i.test(source)
  const usesServiceRole = /SUPABASE_SERVICE_ROLE_KEY|service_role|createServiceRole|supabaseAdmin/i.test(source)
  const consumesRequestBody = /\brequest\.(json|formData|text|arrayBuffer)\s*\(|\breq\.(json|formData|text|arrayBuffer)\s*\(/i.test(source)
  const validatesBody =
    /z\.object|safeParse|\.parse\(|requestSchema|bodySchema|validate/i.test(source) ||
    /Array\.isArray|typeof\s+[A-Za-z0-9_.[\]]+|instanceof\s+FormData|isValid[A-Za-z0-9_]*|emailRegex|schema/i.test(source) ||
    /\bif\s*\(\s*!\s*[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*|\?\.[A-Za-z_$][A-Za-z0-9_$]*)?\s*\)/.test(source) ||
    /[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*|\?\.[A-Za-z_$][A-Za-z0-9_$]*)?\s*={2,3}\s*(?:undefined|null)/.test(source) ||
    /\b(?:Number|String|Boolean)\.is[A-Za-z]+\s*\(/.test(source)
  const mutates = methods.some((method) => MUTATING_METHODS.has(method))
  const classification = classifyRoute(routePath, source, {
    hasSessionAuth,
    hasOrgContext,
    hasInternalSecret,
    hasWebhookSignature,
  })

  return {
    file,
    routePath,
    methods,
    classification,
    hasCsrf,
    hasSessionAuth,
    hasOrgContext,
    hasInternalSecret,
    hasWebhookSignature,
    hasRateLimit,
    usesServiceRole,
    consumesRequestBody,
    validatesBody,
    mutates,
    notes: [],
  }
}

function classifyRoute(
  routePath: string,
  source: string,
  signals: Pick<RouteInventoryItem, 'hasSessionAuth' | 'hasOrgContext' | 'hasInternalSecret' | 'hasWebhookSignature'>,
): RouteInventoryItem['classification'] {
  if (/\/internal\//.test(routePath) || signals.hasInternalSecret) return 'internal'
  if (/\/webhooks?\//.test(routePath) || signals.hasWebhookSignature) return 'webhook'
  if (/test|debug|diagnostic|clear|admin/i.test(routePath) && !signals.hasSessionAuth && !signals.hasOrgContext) return 'diagnostic'
  if (signals.hasSessionAuth || signals.hasOrgContext) return 'authenticated'
  if (
    PUBLIC_ROUTE_ALLOWLIST.some((pattern) => pattern.test(routePath)) ||
    /NextResponse\.json\(\{\s*status:\s*'ok'/.test(source) ||
    /status:\s*410|retired[A-Za-z0-9_]*Response/i.test(source)
  ) return 'public'
  return 'unknown'
}

function findRouteIssues(item: RouteInventoryItem): AuditFinding[] {
  const findings: AuditFinding[] = []
  const isAllowedPublic = PUBLIC_ROUTE_ALLOWLIST.some((pattern) => pattern.test(item.routePath))
  const isExplicitlyPublic = item.classification === 'public'
  const hasAnyAuth = item.hasSessionAuth || item.hasOrgContext || item.hasInternalSecret || item.hasWebhookSignature

  if (/\/internal\//.test(item.routePath) && !hasAnyAuth) {
    findings.push(createFinding({
      severity: 'P1',
      subsystem: 'api-routes',
      title: 'Internal route has no obvious auth guard',
      file: item.file,
      risk: 'Internal routes can expose privileged operations if reachable without a bearer, session, or webhook guard.',
      recommendation: 'Add shared internal bearer/HMAC auth or prove the route is unreachable.',
      evidence: { routePath: item.routePath, methods: item.methods },
    }))
  }

  if (item.mutates && !hasAnyAuth && !isAllowedPublic && !isExplicitlyPublic) {
    findings.push(createFinding({
      severity: 'P1',
      subsystem: 'api-routes',
      title: 'Mutating route has no obvious auth guard',
      file: item.file,
      risk: 'Unauthenticated mutation routes can create data integrity, tenant isolation, or abuse issues.',
      recommendation: 'Add auth/CSRF/webhook signature checks or add the route to an explicit public allowlist with rationale.',
      evidence: { routePath: item.routePath, methods: item.methods },
    }))
  }

  if (item.usesServiceRole && item.classification === 'unknown') {
    findings.push(createFinding({
      severity: 'P2',
      subsystem: 'api-routes',
      title: 'Service-role route has unknown access classification',
      file: item.file,
      risk: 'Service-role DB access bypasses RLS and should have clear route-level access control.',
      recommendation: 'Classify this route and ensure it has session, org, internal, or webhook auth.',
      evidence: { routePath: item.routePath, methods: item.methods },
    }))
  }

  if (item.mutates && item.consumesRequestBody && !item.validatesBody && !item.hasWebhookSignature) {
    findings.push(createFinding({
      severity: 'P3',
      subsystem: 'api-routes',
      title: 'Mutating route has no obvious request validation',
      file: item.file,
      risk: 'Routes without request validation are easier to regress and harder to safely expose.',
      recommendation: 'Use zod, a shared request schema, or explicit type/shape guards where this route accepts input.',
      evidence: { routePath: item.routePath, methods: item.methods },
    }))
  }

  return findings
}

function routePathFromFile(file: string): string {
  const withoutPrefix = file.replace(/^src\/app\/api/, '/api')
  const withoutRoute = withoutPrefix.replace(/\/route\.tsx?$/, '')
  return withoutRoute
    .split('/')
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
    .map((segment) => {
      if (segment.startsWith('[') && segment.endsWith(']')) return `:${segment.slice(1, -1).replace('...', '')}`
      return segment
    })
    .join(path.posix.sep)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd()
  buildRouteAuthInventory(root)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
