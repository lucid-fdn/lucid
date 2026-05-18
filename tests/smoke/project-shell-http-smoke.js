#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

function loadEnvValue(key) {
  const fromProcess = process.env[key]?.trim()
  if (fromProcess) return fromProcess

  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return null

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue
    const currentKey = trimmed.slice(0, separatorIndex).trim()
    if (currentKey !== key) continue
    return trimmed.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, '$1')
  }

  return null
}

function getSupabaseAdminContext() {
  const baseUrl =
    loadEnvValue('SUPABASE_URL') ||
    loadEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = loadEnvValue('SUPABASE_SERVICE_ROLE_KEY')

  if (!baseUrl || !serviceRoleKey) return null

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    serviceRoleKey,
  }
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: 'manual',
    })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchWithRetries(url, init, timeoutMs, retries = 3) {
  let lastError = null

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs)
    } catch (error) {
      lastError = error
      if (attempt === retries) break
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt))
    }
  }

  throw lastError
}

async function fetchJsonWithRetries(url, init, timeoutMs) {
  const response = await fetchWithRetries(url, init, timeoutMs)
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`)
  }
  return response.json()
}

function assertLocation(route, location) {
  if (!route.allowedLocationIncludes) return

  const allowed = Array.isArray(route.allowedLocationIncludes)
    ? route.allowedLocationIncludes
    : [route.allowedLocationIncludes]

  const matched = location && allowed.some((value) => location.includes(value))
  if (!matched) {
    throw new Error(
      `${route.path} expected location containing one of ${allowed.join(', ')}, received ${location || 'null'}`,
    )
  }
}

async function discoverWorkspaceFromAppApi(baseUrl, routeTimeoutMs) {
  const orgs = await fetchJsonWithRetries(`${baseUrl}/api/organizations/user`, {}, routeTimeoutMs)
  const org = Array.isArray(orgs) ? orgs.find((item) => item?.id && item?.slug) : null
  if (!org) return null

  const workspace = await fetchJsonWithRetries(`${baseUrl}/api/workspace?org_id=${encodeURIComponent(org.id)}`, {}, routeTimeoutMs)
  const project = workspace?.project
  if (!project?.slug) return null

  return {
    workspaceSlug: org.slug,
    projectSlug: project.slug,
    source: 'app-api',
  }
}

async function discoverWorkspaceFromSupabase(routeTimeoutMs) {
  const admin = getSupabaseAdminContext()
  if (!admin) return null

  const headers = {
    apikey: admin.serviceRoleKey,
    Authorization: `Bearer ${admin.serviceRoleKey}`,
  }
  const projectsUrl = `${admin.baseUrl}/rest/v1/projects?select=slug,org_id&slug=not.is.null&org_id=not.is.null&order=created_at.desc&limit=50`
  const projects = await fetchJsonWithRetries(projectsUrl, { headers }, routeTimeoutMs)

  for (const project of Array.isArray(projects) ? projects : []) {
    if (!project?.slug || !project?.org_id) continue
    const orgUrl = `${admin.baseUrl}/rest/v1/organizations?select=slug&id=eq.${encodeURIComponent(project.org_id)}&limit=1`
    const orgs = await fetchJsonWithRetries(orgUrl, { headers }, routeTimeoutMs)
    const org = Array.isArray(orgs) ? orgs[0] : null
    if (!org?.slug) continue
    return {
      workspaceSlug: org.slug,
      projectSlug: project.slug,
      source: 'supabase',
    }
  }

  return null
}

async function resolveSmokeWorkspace(baseUrl, routeTimeoutMs) {
  const envWorkspaceSlug = process.env.SMOKE_WORKSPACE_SLUG?.trim()
  const envProjectSlug = process.env.SMOKE_PROJECT_SLUG?.trim()
  if (envWorkspaceSlug && envProjectSlug) {
    return {
      workspaceSlug: envWorkspaceSlug,
      projectSlug: envProjectSlug,
      source: 'env',
    }
  }

  const appContext = await discoverWorkspaceFromAppApi(baseUrl, routeTimeoutMs).catch(() => null)
  if (appContext) return appContext

  const dbContext = await discoverWorkspaceFromSupabase(routeTimeoutMs).catch(() => null)
  if (dbContext) return dbContext

  throw new Error(
    'Unable to discover a valid smoke workspace/project. Set SMOKE_WORKSPACE_SLUG and SMOKE_PROJECT_SLUG.',
  )
}

async function main() {
  const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
  const routeTimeoutMs = Number(process.env.SMOKE_ROUTE_TIMEOUT_MS || '360000')
  const smokeContext = await resolveSmokeWorkspace(baseUrl, routeTimeoutMs)
  const { workspaceSlug, projectSlug } = smokeContext

  const routes = [
    {
      path: '/login',
      expectedStatuses: [200],
    },
    {
      path: `/${workspaceSlug}/assistants`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login', `/${workspaceSlug}/projects/${projectSlug}/canvas`],
    },
    {
      path: `/${workspaceSlug}/templates`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login', `/${workspaceSlug}/projects/${projectSlug}/templates`],
    },
    {
      path: `/${workspaceSlug}/mission-control`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login', `/${workspaceSlug}/mission-control/overview`],
    },
    {
      path: `/${workspaceSlug}/projects`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login', `/${workspaceSlug}/projects/${projectSlug}`],
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}/canvas`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login'],
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}/agents`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login'],
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}/inbox`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login'],
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}/work`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login'],
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}/teams`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login'],
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}/runs`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login'],
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}/resources`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login', `/${workspaceSlug}/projects/${projectSlug}/agents`],
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}/templates`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login'],
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}/settings`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login'],
    },
  ]

  console.log(`Running local app smoke against ${baseUrl}`)
  console.log(`Using workspace ${workspaceSlug}, project ${projectSlug} (${smokeContext.source})`)

  const results = []
  for (const route of routes) {
    const response = await fetchWithRetries(`${baseUrl}${route.path}`, {}, routeTimeoutMs)
    const location = response.headers.get('location')

    if (!route.expectedStatuses.includes(response.status)) {
      throw new Error(
        `${route.path} expected status ${route.expectedStatuses.join(' or ')}, received ${response.status}`,
      )
    }

    if (response.status >= 300) {
      assertLocation(route, location)
    }

    results.push({
      path: route.path,
      status: response.status,
      location: location || '',
    })
  }

  console.log('Local app smoke passed:')
  for (const result of results) {
    const locationSuffix = result.location ? ` -> ${result.location}` : ''
    console.log(`  ${result.status} ${result.path}${locationSuffix}`)
  }
}

main().catch((error) => {
  console.error('Local app smoke failed.')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
