import type { Page } from '@playwright/test'
import { createHash, createHmac } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const workspaceSlug = process.env.SMOKE_WORKSPACE_SLUG?.trim() || null
const authFile = path.resolve(process.cwd(), '.playwright/auth/user.json')
const e2eAuthCookie = 'lucid-e2e-auth'

export type OrgInfo = {
  id: string
  slug: string
  name: string
}

export type WorkspaceContext = {
  org: OrgInfo
  project: { id: string; slug: string; name: string }
}

type SupabaseAdminContext = {
  baseUrl: string
  serviceRoleKey: string
}

type LocalAuthContext = {
  baseUrl: string
  anonKey: string
}

function getE2EWorkspaceTimestamp(org: Pick<OrgInfo, 'slug' | 'name'>): number {
  const text = `${org.slug} ${org.name}`
  const match = text.match(/e2e-(?:isolated|workspace)-(\d{10,})|E2E (?:Isolated )?Workspace (\d{10,})/i)
  return Number(match?.[1] ?? match?.[2] ?? 0)
}

function selectWorkspaceCandidates(orgs: OrgInfo[]): OrgInfo[] {
  if (workspaceSlug) {
    return orgs.filter((item) => item.slug === workspaceSlug)
  }

  const e2eOrgs = orgs
    .filter((item) => item.slug.startsWith('e2e-') || item.name.startsWith('E2E '))
    .sort((a, b) => getE2EWorkspaceTimestamp(b) - getE2EWorkspaceTimestamp(a))

  const source = e2eOrgs.length > 0 ? e2eOrgs : orgs
  const limit = Math.max(1, Math.min(Number(process.env.E2E_WORKSPACE_CANDIDATE_LIMIT ?? 5), 20))
  return source.slice(0, limit)
}

function loadEnvValue(key: string): string | null {
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

export function getSupabaseAdminContext(): SupabaseAdminContext | null {
  const baseUrl =
    loadEnvValue('SUPABASE_URL') ??
    loadEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = loadEnvValue('SUPABASE_SERVICE_ROLE_KEY')

  if (!baseUrl || !serviceRoleKey) return null

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    serviceRoleKey,
  }
}

function getLocalAuthContext(): LocalAuthContext | null {
  const baseUrl =
    loadEnvValue('SUPABASE_URL') ??
    loadEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey =
    loadEnvValue('SUPABASE_ANON_KEY') ??
    loadEnvValue('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  if (!baseUrl || !anonKey) {
    return null
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    anonKey,
  }
}

function e2eHandleForEmail(email: string): string {
  const localPart = email.split('@')[0] ?? 'e2e'
  const normalized = localPart.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '')
  const hash = createHash('sha256').update(email).digest('hex').slice(0, 8)
  return `${(normalized || 'e2e').slice(0, 20)}_${hash}`.slice(0, 32)
}

function signE2EAuthCookie(userId: string, secret: string): { value: string; expiresAt: number } {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000
  const payload = `${userId}:${expiresAt}`
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return {
    value: Buffer.from(JSON.stringify({ userId, expiresAt, signature })).toString('base64url'),
    expiresAt,
  }
}

async function ensureSignedE2EAuthProfile(page: Page, email: string): Promise<string | null> {
  const admin = getSupabaseAdminContext()
  if (!admin) return null

  const headers = {
    apikey: admin.serviceRoleKey,
    Authorization: `Bearer ${admin.serviceRoleKey}`,
    'Content-Type': 'application/json',
  }
  const profileUrl = `${admin.baseUrl}/rest/v1/profiles`
  const lookupByEmail = await page.request.fetch(
    `${profileUrl}?select=id&email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers, failOnStatusCode: false, timeout: 120_000 },
  )
  if (lookupByEmail.ok()) {
    const rows = await lookupByEmail.json() as Array<{ id?: string }>
    if (rows[0]?.id) return rows[0].id
  }

  const handle = e2eHandleForEmail(email)
  const lookupByHandle = await page.request.fetch(
    `${profileUrl}?select=id&handle=eq.${encodeURIComponent(handle)}&limit=1`,
    { headers, failOnStatusCode: false, timeout: 120_000 },
  )
  if (lookupByHandle.ok()) {
    const rows = await lookupByHandle.json() as Array<{ id?: string }>
    if (rows[0]?.id) return rows[0].id
  }

  const create = async (data: Record<string, unknown>) => page.request.fetch(profileUrl, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation',
    },
    data,
    failOnStatusCode: false,
    timeout: 120_000,
  })

  let createResponse = await create({
    handle,
    email,
    name: 'E2E Local User',
    first_name: 'E2E',
    last_name: 'Local User',
    onboarding_completed: true,
    profile_public: false,
  })
  if (!createResponse.ok()) {
    createResponse = await create({
      handle,
      email,
      name: 'E2E Local User',
    })
  }
  if (!createResponse.ok()) return null

  const created = await createResponse.json() as Array<{ id?: string }>
  return created[0]?.id ?? null
}

export async function applySignedE2EAuthSession(page: Page, email: string): Promise<boolean> {
  const admin = getSupabaseAdminContext()
  if (!admin) return false

  const userId = await ensureSignedE2EAuthProfile(page, email)
  if (!userId) return false

  const signed = signE2EAuthCookie(userId, admin.serviceRoleKey)
  await page.context().addCookies([{
    name: e2eAuthCookie,
    value: signed.value,
    url: page.url(),
    httpOnly: true,
    sameSite: 'Lax',
    secure: false,
    expires: Math.floor(signed.expiresAt / 1000),
  }])

  await page.request.get('/api/auth/csrf', { timeout: 120_000 })
  const meResponse = await page.request.get('/api/user/me', {
    failOnStatusCode: false,
    timeout: 120_000,
  })
  if (!meResponse.ok()) return false

  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
  return true
}

async function ensureLocalAuthUser(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const admin = getSupabaseAdminContext()
  if (!admin) {
    return
  }

  const adminResponse = await page.request.fetch(`${admin.baseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: admin.serviceRoleKey,
      Authorization: `Bearer ${admin.serviceRoleKey}`,
    },
    data: {
      email,
      password,
      email_confirm: true,
    },
    failOnStatusCode: false,
    timeout: 120_000,
  })

  if (
    adminResponse.ok() ||
    adminResponse.status() === 422 ||
    adminResponse.status() === 409 ||
    adminResponse.status() === 400
  ) {
    return
  }

  throw new Error(`Local auth user bootstrap failed (${adminResponse.status()})`)
}

async function applyDirectLocalAuthSession(
  page: Page,
  email: string,
  password: string,
): Promise<boolean> {
  const auth = getLocalAuthContext()
  if (!auth) {
    return false
  }

  const tokenResponse = await page.request.fetch(`${auth.baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: auth.anonKey,
    },
    data: {
      email,
      password,
    },
    failOnStatusCode: false,
    timeout: 120_000,
  })

  if (!tokenResponse.ok()) {
    return false
  }

  const tokenBody = (await tokenResponse.json()) as { access_token?: string }
  const accessToken = tokenBody.access_token?.trim()
  if (!accessToken) {
    return false
  }

  await page.context().addCookies([{
    name: 'lucid-auth-token',
    value: accessToken,
    url: page.url(),
    httpOnly: true,
    sameSite: 'Lax',
    secure: false,
  }])

  await page.request.get('/api/auth/csrf', { timeout: 120_000 })
  return true
}

async function listOrganizations(page: Page) {
  const orgsRes = await retryApiGet(page, '/api/organizations/user')
  if (!orgsRes.ok()) {
    throw new Error(`Failed to fetch workspaces (${orgsRes.status()})`)
  }
  return orgsRes.json() as Promise<Array<{ id: string; slug: string; name: string }>>
}

async function getCurrentUserId(page: Page): Promise<string> {
  const readUserId = async () => {
    const response = await retryApiGet(page, '/api/user/me')
    if (!response.ok()) {
      return { userId: null as string | null, status: response.status() }
    }

    const payload = (await response.json()) as { user?: { id?: string } }
    return {
      userId: payload.user?.id ?? null,
      status: response.status(),
    }
  }

  let currentUser = await readUserId()
  if (currentUser.userId) {
    return currentUser.userId
  }

  await restoreBrowserSession(page)
  currentUser = await readUserId()
  if (currentUser.userId) {
    return currentUser.userId
  }

  const admin = getSupabaseAdminContext()
  if (!admin) {
    throw new Error(`Failed to fetch current user (${currentUser.status})`)
  }

  const orgs = await listOrganizations(page)
  const firstOrg = orgs[0]
  if (!firstOrg) {
    throw new Error('Unable to derive current user id without an existing workspace')
  }

  const memberResponse = await page.request.fetch(
    `${admin.baseUrl}/rest/v1/organization_members?organization_id=eq.${encodeURIComponent(firstOrg.id)}&select=user_id`,
    {
      headers: {
        apikey: admin.serviceRoleKey,
        Authorization: `Bearer ${admin.serviceRoleKey}`,
      },
      timeout: 120_000,
      failOnStatusCode: false,
    },
  )

  if (!memberResponse.ok()) {
    throw new Error(`Failed to derive current user from membership (${memberResponse.status()})`)
  }

  const members = (await memberResponse.json()) as Array<{ user_id?: string | null }>
  const userId = members.find((member) => typeof member.user_id === 'string' && member.user_id.length > 0)?.user_id
  if (!userId) {
    throw new Error('Authenticated user payload did not include an id')
  }

  return userId
}

async function retryApiGet(page: Page, url: string) {
  const attempts = 3
  let lastError: unknown = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await page.request.get(url, { timeout: 120_000 })
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      await page.waitForTimeout(250 * attempt)
    }
  }

  throw lastError
}

async function bootstrapWorkspaceViaAdmin(
  page: Page,
  args: { name: string; slug: string },
): Promise<boolean> {
  const admin = getSupabaseAdminContext()
  if (!admin) {
    return false
  }

  const userId = await getCurrentUserId(page)
  const commonHeaders = {
    apikey: admin.serviceRoleKey,
    Authorization: `Bearer ${admin.serviceRoleKey}`,
    'Content-Type': 'application/json',
  }

  const orgResponse = await page.request.fetch(`${admin.baseUrl}/rest/v1/organizations`, {
    method: 'POST',
    headers: {
      ...commonHeaders,
      Prefer: 'return=representation',
    },
    data: {
      slug: args.slug,
      name: args.name,
      type: 'team',
      created_by: userId,
    },
    failOnStatusCode: false,
    timeout: 120_000,
  })

  if (!orgResponse.ok()) {
    return false
  }

  const created = (await orgResponse.json()) as Array<{ id?: string }>
  const orgId = created[0]?.id
  if (!orgId) {
    return false
  }

  const memberResponse = await page.request.fetch(`${admin.baseUrl}/rest/v1/organization_members`, {
    method: 'POST',
    headers: commonHeaders,
    data: {
      organization_id: orgId,
      user_id: userId,
      role: 'owner',
    },
    failOnStatusCode: false,
    timeout: 120_000,
  })

  return memberResponse.ok()
}

async function restoreBrowserSession(page: Page): Promise<void> {
  await page.goto('/login?next=/dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 300_000,
  })

  const existingSessionResponse = await page.request.get('/api/user/me', {
    timeout: 120_000,
  })
  if (existingSessionResponse.ok()) {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 300_000 })
    fs.mkdirSync(path.dirname(authFile), { recursive: true })
    await page.context().storageState({ path: authFile })
    return
  }

  const email = process.env.E2E_AUTH_EMAIL?.trim() || 'e2e-local@raijinlabs.io'
  const password = process.env.E2E_AUTH_PASSWORD?.trim() || 'LucidE2E!23456'

  if (await applySignedE2EAuthSession(page, email).catch(() => false)) {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 300_000 })
    return
  }

  const emailInput = page.getByLabel('Email')
  const localLoginHeading = page.getByText('Sign in to your self-hosted instance.')

  const localAuthDetected = await Promise.any([
    emailInput.waitFor({ state: 'visible', timeout: 7_500 }).then(() => true),
    localLoginHeading.waitFor({ state: 'visible', timeout: 7_500 }).then(() => true),
  ]).catch(() => false)

  if (localAuthDetected) {
    await ensureLocalAuthUser(page, email, password)

    const loginResponse = await page.request.post('/api/auth/local-login', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        email,
        password,
        mode: 'login',
      },
      timeout: 120_000,
    })

    if (!loginResponse.ok()) {
      if (loginResponse.status() === 429) {
        const recovered = await applyDirectLocalAuthSession(page, email, password)
        if (recovered) {
          await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 300_000 })
          fs.mkdirSync(path.dirname(authFile), { recursive: true })
          await page.context().storageState({ path: authFile })
          return
        }
      }

      const body = await loginResponse.text().catch(() => '')
      throw new Error(`Unable to restore browser auth session (${loginResponse.status()}): ${body}`)
    }

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 300_000 })
    fs.mkdirSync(path.dirname(authFile), { recursive: true })
    await page.context().storageState({ path: authFile })
    return
  }

  const recoveredViaLocalAuthApi = await (async () => {
    try {
      await ensureLocalAuthUser(page, email, password)
      const loginResponse = await page.request.post('/api/auth/local-login', {
        headers: {
          'Content-Type': 'application/json',
        },
        data: {
          email,
          password,
          mode: 'login',
        },
        failOnStatusCode: false,
        timeout: 120_000,
      })

      if (loginResponse.ok()) return true
      if (loginResponse.status() === 429) {
        return await applyDirectLocalAuthSession(page, email, password)
      }
      return false
    } catch {
      return false
    }
  })()

  if (recoveredViaLocalAuthApi) {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 300_000 })
    fs.mkdirSync(path.dirname(authFile), { recursive: true })
    await page.context().storageState({ path: authFile })
    return
  }

  const restored = await page.evaluate(async () => {
    const readPrivyValue = (key: string): string | null => {
      const raw = window.localStorage.getItem(key)
      if (!raw) return null
      try {
        return JSON.parse(raw) as string
      } catch {
        return raw
      }
    }

    const token = readPrivyValue('privy:token')
    const idToken = readPrivyValue('privy:id_token')
    const refreshToken = readPrivyValue('privy:refresh_token')

    if (!token && !idToken && !refreshToken) {
      return false
    }

    const cookieParts = ['path=/', 'SameSite=Lax']
    if (token) document.cookie = `privy-token=${token}; ${cookieParts.join('; ')}`
    if (idToken) document.cookie = `privy-id-token=${idToken}; ${cookieParts.join('; ')}`
    if (refreshToken) document.cookie = `privy-refresh-token=${refreshToken}; ${cookieParts.join('; ')}`

    if (token) {
      await fetch('/api/auth/privy-login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      }).catch(() => null)
    }

    return true
  })

  if (!restored) {
    throw new Error('Unable to restore browser auth session')
  }

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 300_000 })
  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
}

export async function ensureWorkspaceOnboarding(page: Page): Promise<Array<{ id: string; slug: string; name: string }>> {
  let existing: Array<{ id: string; slug: string; name: string }>
  try {
    existing = await listOrganizations(page)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('(401)')) {
      throw error
    }
    await restoreBrowserSession(page)
    existing = await listOrganizations(page)
  }
  if (existing.length > 0) return existing

  const stamp = Date.now()
  const workspaceName = `E2E Workspace ${stamp}`
  const workspaceSlug = `e2e-workspace-${stamp}`

  if (await bootstrapWorkspaceViaAdmin(page, { name: workspaceName, slug: workspaceSlug })) {
    return waitForCondition(
      () => listOrganizations(page),
      (orgs) => Array.isArray(orgs) && orgs.length > 0,
      { timeoutMs: 120_000, intervalMs: 2_000 },
    )
  }

  await page.goto('/onboarding/workspace/new', {
    waitUntil: 'domcontentloaded',
    timeout: 300_000,
  })

  await page.locator('#name').fill(workspaceName)
  await page.locator('#slug').fill(workspaceSlug)
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByText('AI Development', { exact: true }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByText('Solo', { exact: true }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByText('Agent Development', { exact: true }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByRole('button', { name: 'Skip for now' }).click()
  await page.getByRole('button', { name: 'Create Workspace' }).click()
  return waitForCondition(
    () => listOrganizations(page),
    (orgs) => Array.isArray(orgs) && orgs.length > 0,
    { timeoutMs: 300_000, intervalMs: 2_000 },
  )
}

async function createBootstrapProject(page: Page, orgId: string): Promise<{ id: string; slug: string; name: string }> {
  let lastError = 'Failed to create bootstrap project'

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await page.request.post(`/api/workspaces/${orgId}/projects`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        name: `E2E Bootstrap ${Date.now()}`,
        description: 'Bootstrap project for smoke tests',
      },
      timeout: 120_000,
    })

    if (response.ok()) {
      const body = await response.json()
      return body.project as { id: string; slug: string; name: string }
    }

    const body = await response.json().catch(() => null)
    lastError = body?.error || `Failed to create bootstrap project (${response.status()})`
    await page.waitForTimeout(1000 * (attempt + 1))
  }

  throw new Error(lastError)
}

export async function getWorkspaceContext(page: Page): Promise<WorkspaceContext> {
  const orgs = await ensureWorkspaceOnboarding(page)
  const candidates = selectWorkspaceCandidates(orgs)

  if (candidates.length === 0) {
    throw new Error(
      workspaceSlug
        ? `Workspace ${workspaceSlug} not found`
        : 'No workspaces available for the authenticated user',
    )
  }

  const failures: string[] = []

  for (const org of candidates) {
    const workspaceRes = await page.request.get(`/api/workspace?org_id=${org.id}`, {
      failOnStatusCode: false,
      timeout: 120_000,
    })
    let workspace = await workspaceRes.json().catch(() => ({}))

    if (!workspace.project?.id) {
      try {
        const bootstrapProject = await createBootstrapProject(page, org.id)
        const hydratedWorkspaceRes = await page.request.get(
          `/api/workspace?org_id=${org.id}&project_id=${bootstrapProject.id}`,
          { failOnStatusCode: false, timeout: 120_000 },
        )
        workspace = await hydratedWorkspaceRes.json().catch(() => ({}))
      } catch (error) {
        failures.push(`${org.slug}: ${error instanceof Error ? error.message : String(error)}`)
        if (workspaceSlug) break
        continue
      }
    }

    if (!workspace.project?.id) {
      failures.push(`${org.slug}: workspace did not return a project`)
      if (workspaceSlug) break
      continue
    }

    return {
      org: {
        id: org.id,
        slug: org.slug,
        name: org.name,
      },
      project: {
        id: workspace.project.id,
        slug: workspace.project.slug,
        name: workspace.project.name,
      },
    }
  }

  throw new Error(`No writable workspace context found: ${failures.join('; ') || 'no candidates'}`)
}

export async function createIsolatedWorkspaceContext(page: Page): Promise<WorkspaceContext> {
  const stamp = Date.now()
  const workspaceName = `E2E Isolated Workspace ${stamp}`
  const workspaceSlug = `e2e-isolated-${stamp}`

  const created = await bootstrapWorkspaceViaAdmin(page, {
    name: workspaceName,
    slug: workspaceSlug,
  })

  if (!created) {
    throw new Error('Failed to create isolated workspace fixture')
  }

  const orgs = await waitForCondition(
    () => listOrganizations(page),
    (items) => items.some((item) => item.slug === workspaceSlug),
    { timeoutMs: 120_000, intervalMs: 2_000 },
  )

  const org = orgs.find((item) => item.slug === workspaceSlug)
  if (!org) {
    throw new Error('Created isolated workspace did not become visible')
  }

  const project = await createBootstrapProject(page, org.id)

  return {
    org,
    project,
  }
}

export async function getCsrfToken(page: Page): Promise<string> {
  let lastBody = ''
  let lastStatus = 0

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await page.request.get('/api/auth/csrf', { timeout: 120_000 })
    lastStatus = response.status()
    lastBody = await response.text()

    try {
      const payload = JSON.parse(lastBody) as { token?: string }
      if (typeof payload.token === 'string' && payload.token.length > 0) {
        return payload.token
      }
    } catch {
      // Dev server overlays can briefly return HTML while recompiling.
    }

    await page.waitForTimeout(1000)
  }

  throw new Error(`Failed to load CSRF token (${lastStatus}): ${lastBody.slice(0, 200)}`)
}

export async function createAssistant(page: Page, args: { orgId: string; projectId?: string; name: string; csrfToken: string }) {
  let projectId = args.projectId
  if (!projectId) {
    const workspaceResponse = await page.request.get(`/api/workspace?org_id=${args.orgId}`, { timeout: 120_000 })
    const workspace = await workspaceResponse.json().catch(() => null)
    projectId = workspace?.project?.id
  }

  const response = await page.request.post('/api/assistants', {
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': args.csrfToken,
    },
    data: {
      name: args.name,
      orgId: args.orgId,
      project_id: projectId,
      projectId,
      engine: 'openclaw',
    },
    timeout: 180_000,
  })

  return {
    status: response.status(),
    body: await response.json(),
  }
}

export async function chatAssistant(page: Page, assistantId: string, prompt: string) {
  let response: Awaited<ReturnType<Page['request']['post']>> | null = null
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await page.request.post(`/api/assistants/${assistantId}/chat`, {
      headers: {
        'x-lucid-e2e-mock-chat': '1',
      },
      data: {
        messages: [{ id: crypto.randomUUID(), role: 'user', content: prompt }],
      },
      timeout: 120_000,
    })

    if (response.status() !== 404) break
    await page.waitForTimeout(750 * (attempt + 1))
  }

  if (!response) {
    throw new Error('Failed to issue assistant chat request')
  }

  return {
    status: response.status(),
    contentType: response.headers()['content-type'],
    route: response.headers()['x-lucid-route'] ?? null,
    routeReason: response.headers()['x-lucid-route-reason'] ?? null,
    text: await response.text(),
  }
}

export async function deleteAssistant(page: Page, args: { assistantId: string; csrfToken: string }) {
  const response = await page.request.delete(`/api/assistants/${args.assistantId}`, {
    headers: {
      'x-csrf-token': args.csrfToken,
    },
    timeout: 180_000,
  })

  return {
    status: response.status(),
    body: await response.json().catch(() => null),
  }
}

export async function deleteAssistantBestEffort(
  page: Page,
  args: { assistantId: string; csrfToken: string; timeoutMs?: number },
) {
  try {
    const response = await page.request.delete(`/api/assistants/${args.assistantId}`, {
      headers: {
        'x-csrf-token': args.csrfToken,
      },
      timeout: args.timeoutMs ?? 45_000,
    })

    return {
      status: response.status(),
      body: await response.json().catch(() => null),
    }
  } catch {
    return null
  }
}

export async function createTeam(page: Page, args: { orgId: string; projectId: string; name: string; objective: string }) {
  const response = await page.request.post('/api/crews', {
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      org_id: args.orgId,
      project_id: args.projectId,
      name: args.name,
      objective: args.objective,
    },
    timeout: 180_000,
  })

  return {
    status: response.status(),
    body: await response.json(),
  }
}

export async function updateAssistant(page: Page, args: {
  assistantId: string
  csrfToken: string
  patch: Record<string, unknown>
}) {
  const response = await page.request.patch(`/api/assistants/${args.assistantId}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': args.csrfToken,
    },
    data: args.patch,
    timeout: 180_000,
  })

  return {
    status: response.status(),
    body: await response.json().catch(() => null),
  }
}

export async function createTeamWithMembers(page: Page, args: {
  orgId: string
  projectId: string
  name: string
  objective: string
  members: Array<{ assistant_id: string; role: string; is_coordinator?: boolean }>
  edges?: Array<{
    source_member_index: number
    target_member_index: number
    direction: 'bidirectional' | 'source_to_target' | 'target_to_source'
  }>
}) {
  const response = await page.request.post('/api/crews', {
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      org_id: args.orgId,
      project_id: args.projectId,
      name: args.name,
      objective: args.objective,
      members: args.members,
      edges: args.edges ?? [],
    },
    timeout: 180_000,
  })

  return {
    status: response.status(),
    body: await response.json(),
  }
}

export async function deleteTeam(page: Page, args: { teamId: string; orgId: string; projectId: string }) {
  const response = await page.request.delete(`/api/crews/${args.teamId}?org_id=${args.orgId}&project_id=${args.projectId}`, {
    timeout: 120_000,
  })

  return {
    status: response.status(),
    body: await response.json().catch(() => null),
  }
}

export async function getTeams(page: Page, args: { orgId: string; projectId: string }) {
  const response = await page.request.get(`/api/crews?org_id=${args.orgId}&project_id=${args.projectId}`, {
    timeout: 120_000,
  })

  return {
    status: response.status(),
    body: await response.json(),
  }
}

export async function getRuntimes(page: Page, orgId: string) {
  const response = await page.request.get(`/api/runtimes?org_id=${orgId}`, {
    timeout: 180_000,
  })
  return {
    status: response.status(),
    body: await response.json(),
  }
}

export async function deleteRuntime(page: Page, args: { orgId: string; runtimeId: string }) {
  const response = await page.request.delete(`/api/runtimes/${args.runtimeId}?org_id=${args.orgId}`, {
    timeout: 120_000,
  })

  return {
    status: response.status(),
    body: await response.json().catch(() => null),
  }
}

export async function deployDedicatedRuntimeForAgent(page: Page, args: {
  orgId: string
  agentId: string
  csrfToken: string
  displayName?: string
}) {
  const response = await page.request.post(`/api/runtimes/deploy-for-agent?org_id=${args.orgId}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': args.csrfToken,
    },
    data: {
      requestId: crypto.randomUUID(),
      agentId: args.agentId,
      engine: 'openclaw',
      provider: 'railway',
      runtimeFlavor: 'c1_managed',
      displayName: args.displayName ?? `E2E dedicated ${Date.now()}`,
    },
    timeout: 180_000,
  })

  return {
    status: response.status(),
    body: await response.json(),
  }
}

export async function getCanvasTopology(page: Page, orgId: string) {
  const response = await page.request.get(`/api/mission-control/canvas/topology?org_id=${orgId}`, {
    timeout: 180_000,
  })
  return {
    status: response.status(),
    body: await response.json(),
  }
}

export async function getRuntimeL2Status(page: Page, args: { orgId: string; runtimeId: string }) {
  const response = await page.request.get(`/api/runtimes/${args.runtimeId}/l2-status?org_id=${args.orgId}`, {
    timeout: 180_000,
  })
  return {
    status: response.status(),
    body: await response.json(),
  }
}

export async function createOfflineRuntimeFixture(page: Page, args: {
  orgId: string
  displayName?: string
  engine?: 'openclaw' | 'hermes'
}) {
  const admin = getSupabaseAdminContext()
  if (!admin) {
    throw new Error('Supabase admin context unavailable for offline runtime fixture')
  }

  const runtimeId = crypto.randomUUID()
  const now = new Date()
  const lastSeenAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()

  const response = await page.request.fetch(`${admin.baseUrl}/rest/v1/dedicated_runtimes`, {
    method: 'POST',
    headers: {
      apikey: admin.serviceRoleKey,
      Authorization: `Bearer ${admin.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    data: {
      id: runtimeId,
      org_id: args.orgId,
      display_name: args.displayName ?? `E2E Offline Runtime ${Date.now()}`,
      provider: 'manual',
      api_key_hash: `e2e-${Date.now()}`,
      managed_by_lucid: false,
      engine: args.engine ?? 'openclaw',
      runtime_tier: 'byo',
      runtime_flavor: 'c2a_autonomous',
      channel_ownership: 'runtime_native',
      runtime_protocol: 'lucid-runtime-v1',
      dedicated_transport_mode: 'native_pulse',
      channel_mode: 'native',
      status: 'offline',
      last_seen_at: lastSeenAt,
      deployment_url: 'https://offline-runtime.invalid',
      maintenance_channel: 'stable',
      auto_update_policy: 'manual',
      engine_metadata: {},
      runtime_bootstrap_config: null,
    },
    timeout: 120_000,
    failOnStatusCode: false,
  })

  if (!response.ok()) {
    const body = await response.text()
    throw new Error(`Failed to create offline runtime fixture (${response.status()}): ${body}`)
  }

  return { runtimeId }
}

export async function getProjects(page: Page, orgId: string) {
  const response = await page.request.get(`/api/workspaces/${orgId}/projects`, {
    timeout: 120_000,
  })

  return {
    status: response.status(),
    body: await response.json(),
  }
}

export async function archiveProject(page: Page, args: { orgId: string; projectId: string }) {
  const response = await page.request.patch(`/api/workspaces/${args.orgId}/projects/${args.projectId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      archive: true,
    },
    timeout: 120_000,
  })

  return {
    status: response.status(),
    body: await response.json().catch(() => null),
  }
}

export async function waitForCondition<T>(
  producer: () => Promise<T>,
  predicate: (value: T) => boolean,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 180_000
  const intervalMs = options?.intervalMs ?? 5_000
  const deadline = Date.now() + timeoutMs

  let lastValue = await producer()
  while (!predicate(lastValue)) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    lastValue = await producer()
  }

  return lastValue
}
