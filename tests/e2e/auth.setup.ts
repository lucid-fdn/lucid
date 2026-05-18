import { expect, test, type APIRequestContext } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { applySignedE2EAuthSession, ensureWorkspaceOnboarding } from './helpers'

const authFile = '.playwright/auth/user.json'

type LocalAuthEnv = {
  supabaseUrl: string | null
  serviceRoleKey: string | null
  anonKey: string | null
}

function truthyEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function loadLocalEnvValue(key: string): string | null {
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

function getLocalAuthEnv(): LocalAuthEnv {
  return {
    supabaseUrl:
      loadLocalEnvValue('SUPABASE_URL') ??
      loadLocalEnvValue('NEXT_PUBLIC_SUPABASE_URL'),
    serviceRoleKey: loadLocalEnvValue('SUPABASE_SERVICE_ROLE_KEY'),
    anonKey:
      loadLocalEnvValue('SUPABASE_ANON_KEY') ??
      loadLocalEnvValue('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
}

async function ensureLocalAuthUser(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const { supabaseUrl, serviceRoleKey } = getLocalAuthEnv()
  if (!supabaseUrl || !serviceRoleKey) {
    return
  }

  const adminResponse = await request.fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
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

  throw new Error(`Local auth user bootstrap failed: ${adminResponse.status()}`)
}

async function applyDirectLocalAuthSession(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
): Promise<boolean> {
  const { supabaseUrl, anonKey } = getLocalAuthEnv()
  if (!supabaseUrl || !anonKey) {
    return false
  }

  const tokenResponse = await page.request.fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
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
  const meResponse = await page.request.get('/api/user/me', {
    failOnStatusCode: false,
    timeout: 120_000,
  })
  return meResponse.ok()
}

async function seedDirectLocalAuthStorageState(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
): Promise<boolean> {
  await ensureLocalAuthUser(page.request, email, password)
  const seeded = await applyDirectLocalAuthSession(page, email, password)
  if (!seeded) return false

  await ensureLocalProfileOnboarding(page.request, email)
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  const orgs = await ensureWorkspaceOnboarding(page)
  if (!Array.isArray(orgs) || orgs.length === 0) {
    throw new Error('Authenticated successfully, but workspace bootstrap still yielded zero workspaces.')
  }
  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
  return true
}

async function ensureLocalProfileOnboarding(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const { supabaseUrl, serviceRoleKey } = getLocalAuthEnv()
  if (!supabaseUrl || !serviceRoleKey) {
    return
  }

  const meResponse = await request.get('/api/user/me', { timeout: 120_000 })
  if (!meResponse.ok()) {
    throw new Error(`Failed to fetch local auth user profile: ${meResponse.status()}`)
  }

  const payload = (await meResponse.json()) as {
    user?: {
      id?: string
      handle?: string
      name?: string
    }
  }

  const userId = payload.user?.id
  if (!userId) {
    throw new Error('Local auth user payload did not include an id')
  }

  const localPart = email.split('@')[0] ?? 'e2e_user'
  const normalizedHandle =
    payload.user?.handle?.trim() ||
    localPart.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32) ||
    `e2e_user_${Date.now()}`

  const updateResponse = await request.fetch(
    `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/profiles?id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: 'return=representation',
      },
      data: {
        handle: normalizedHandle,
        name: payload.user?.name?.trim() || 'E2E Local User',
        first_name: 'E2E',
        last_name: 'Local User',
        onboarding_completed: true,
      },
      failOnStatusCode: false,
      timeout: 120_000,
    },
  )

  if (!updateResponse.ok()) {
    throw new Error(`Local profile onboarding bootstrap failed: ${updateResponse.status()}`)
  }

  await expect.poll(async () => {
    const profileResponse = await request.get('/api/user/profile', {
      failOnStatusCode: false,
      timeout: 120_000,
    })
    if (!profileResponse.ok()) return false
    const profile = await profileResponse.json() as { onboarding_completed?: boolean }
    return profile.onboarding_completed === true
  }, {
    timeout: 45_000,
    message: 'expected local e2e profile onboarding to be visible to the app server',
  }).toBe(true)
}

test('authenticate e2e browser context', async ({ page }) => {
  const email =
    process.env.E2E_AUTH_EMAIL?.trim() ||
    'e2e-local@raijinlabs.io'
  const password = process.env.E2E_AUTH_PASSWORD?.trim() || 'LucidE2E!23456'
  const manualPrivy = truthyEnv(process.env.E2E_AUTH_MANUAL_PRIVY ?? 'false')

  await page.goto('/login?next=/dashboard', { waitUntil: 'domcontentloaded' })

  const existingSessionResponse = await page.request.get('/api/user/me', {
    timeout: 120_000,
  })
  if (existingSessionResponse.ok()) {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    const orgs = await ensureWorkspaceOnboarding(page)
    if (!Array.isArray(orgs) || orgs.length === 0) {
      throw new Error('Authenticated successfully, but workspace bootstrap still yielded zero workspaces.')
    }
    fs.mkdirSync(path.dirname(authFile), { recursive: true })
    await page.context().storageState({ path: authFile })
    return
  }

  if (await applySignedE2EAuthSession(page, email).catch(() => false)) {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    const orgs = await ensureWorkspaceOnboarding(page)
    if (!Array.isArray(orgs) || orgs.length === 0) {
      throw new Error('Authenticated successfully, but workspace bootstrap still yielded zero workspaces.')
    }
    fs.mkdirSync(path.dirname(authFile), { recursive: true })
    await page.context().storageState({ path: authFile })
    return
  }

  if (await seedDirectLocalAuthStorageState(page, email, password).catch(() => false)) {
    return
  }

  const emailInput = page.getByLabel('Email')
  const localLoginHeading = page.getByText('Sign in to your self-hosted instance.')

  const localAuthDetected = await Promise.any([
    emailInput.waitFor({ state: 'visible', timeout: 7_500 }).then(() => true),
    localLoginHeading.waitFor({ state: 'visible', timeout: 7_500 }).then(() => true),
  ]).catch(() => false)

  if (localAuthDetected) {
    if (!email || !password) {
      throw new Error(
        'Local auth detected, but E2E_AUTH_EMAIL / E2E_AUTH_PASSWORD are not set.',
      )
    }

    await ensureLocalAuthUser(page.request, email, password)

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
          await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
          await ensureLocalProfileOnboarding(page.request, email)
          fs.mkdirSync(path.dirname(authFile), { recursive: true })
          await page.context().storageState({ path: authFile })
          return
        }
      }

      throw new Error(`Local auth login failed: ${loginResponse.status()}`)
    }

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await ensureLocalProfileOnboarding(page.request, email)
  } else {
    const directLocalRecovery = await (async () => {
      try {
        await ensureLocalAuthUser(page.request, email, password)
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

    if (directLocalRecovery) {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await ensureLocalProfileOnboarding(page.request, email)
    } else {
      if (!manualPrivy) {
        throw new Error(
          'Privy auth detected. Run headed with E2E_AUTH_MANUAL_PRIVY=true to complete one-time login and save storage state.',
        )
      }

      console.log('[playwright auth] Privy login detected. Complete login in the browser window; setup will continue after redirect.')
    }
  }

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 5 * 60_000 })
  await expect.poll(async () => {
    const response = await page.request.get('/api/user/me', { timeout: 120_000 })
    return response.status()
  }, {
    timeout: 60_000,
    message: 'expected authenticated session after e2e auth bootstrap',
  }).toBe(200)

  const orgs = await ensureWorkspaceOnboarding(page)
  if (!Array.isArray(orgs) || orgs.length === 0) {
    throw new Error('Authenticated successfully, but workspace bootstrap still yielded zero workspaces.')
  }

  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
})
