#!/usr/bin/env node

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createHash, createHmac } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function loadEnv(file = '.env.local') {
  const env = {}
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    value = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
    env[key] = value
  }
  return { ...env, ...process.env }
}

function handleForEmail(email) {
  const localPart = email.split('@')[0] ?? 'e2e'
  const normalized = localPart.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '')
  const hash = createHash('sha256').update(email).digest('hex').slice(0, 8)
  return `${(normalized || 'e2e').slice(0, 20)}_${hash}`.slice(0, 32)
}

function signE2EAuthCookie(userId, secret) {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000
  const payload = `${userId}:${expiresAt}`
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return {
    value: Buffer.from(JSON.stringify({ userId, expiresAt, signature })).toString('base64url'),
    expiresAt,
  }
}

async function ensureProfile(supabase, email) {
  const normalizedEmail = email.trim().toLowerCase()
  const { data: byEmail, error: byEmailError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', normalizedEmail)
    .limit(1)
  if (byEmailError) throw new Error(`Profile lookup failed: ${byEmailError.message}`)
  if (byEmail?.[0]?.id) return byEmail[0].id

  const handle = handleForEmail(normalizedEmail)
  const { data: byHandle, error: byHandleError } = await supabase
    .from('profiles')
    .select('id')
    .eq('handle', handle)
    .limit(1)
  if (byHandleError) throw new Error(`Profile handle lookup failed: ${byHandleError.message}`)
  if (byHandle?.[0]?.id) return byHandle[0].id

  const { data: created, error: createError } = await supabase
    .from('profiles')
    .insert({
      handle,
      email: normalizedEmail,
      name: 'E2E Staging User',
      first_name: 'E2E',
      last_name: 'Staging User',
      onboarding_completed: true,
      profile_public: false,
    })
    .select('id')
    .single()
  if (createError) throw new Error(`Profile create failed: ${createError.message}`)
  return created.id
}

async function main() {
  const env = loadEnv()
  const baseURL = (env.STAGING_BASE_URL || env.SMOKE_BASE_URL || env.PLAYWRIGHT_BASE_URL || '').replace(/\/+$/, '')
  const output = env.E2E_AUTH_STATE || '.playwright/auth/staging-vercel.json'
  const email = env.E2E_AUTH_EMAIL || 'e2e-staging@raijinlabs.io'
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const signingSecret = env.E2E_AUTH_BYPASS_SECRET || serviceRoleKey

  if (!baseURL) throw new Error('Set STAGING_BASE_URL or SMOKE_BASE_URL to the Vercel preview/prod URL.')
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  if (!signingSecret) throw new Error('Missing E2E_AUTH_BYPASS_SECRET or SUPABASE_SERVICE_ROLE_KEY.')

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const userId = await ensureProfile(supabase, email)
  const signed = signE2EAuthCookie(userId, signingSecret)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ baseURL })
  try {
    await context.addCookies([{
      name: 'lucid-e2e-auth',
      value: signed.value,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
      secure: baseURL.startsWith('https://'),
      expires: Math.floor(signed.expiresAt / 1000),
    }])

    const page = await context.newPage()
    const csrfResponse = await page.request.get('/api/auth/csrf', { timeout: 120_000, failOnStatusCode: false })
    if (!csrfResponse.ok()) throw new Error(`/api/auth/csrf failed ${csrfResponse.status()}: ${await csrfResponse.text().catch(() => '')}`)

    const meResponse = await page.request.get('/api/user/me', { timeout: 120_000, failOnStatusCode: false })
    if (!meResponse.ok()) throw new Error(`/api/user/me failed ${meResponse.status()}: ${await meResponse.text().catch(() => '')}`)

    fs.mkdirSync(path.dirname(output), { recursive: true })
    await context.storageState({ path: output })
    console.log(JSON.stringify({ ok: true, baseURL, output, userId }, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
