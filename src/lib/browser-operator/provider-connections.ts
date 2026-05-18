import 'server-only'

import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import {
  createBrowserOperatorConnectSession,
  recordBrowserOperatorAuditEvent,
  updateBrowserOperatorAccount,
  updateBrowserOperatorConnectSession,
} from '@/lib/db/browser-operator'
import type {
  BrowserOperatorAccount,
  BrowserOperatorConnectSession,
  BrowserOperatorProviderKind,
} from '@contracts/browser-operator'

type ProviderConnectionResult = {
  status: BrowserOperatorConnectSession['status']
  takeoverUrl?: string
  liveViewUrl?: string
  providerSessionRef?: string
  providerProfileRef?: string
  providerContextRef?: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export async function requestBrowserOperatorSecureTakeover(input: {
  orgId: string
  userId: string
  account: BrowserOperatorAccount
  returnUrl?: string | null
  metadata?: Record<string, unknown>
}): Promise<BrowserOperatorConnectSession> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const session = await createBrowserOperatorConnectSession({
    org_id: input.orgId,
    user_id: input.userId,
    browser_account_id: input.account.id,
    provider: input.account.provider as BrowserOperatorProviderKind,
    status: 'requested',
    return_url: input.returnUrl ?? undefined,
    expires_at: expiresAt,
    metadata: {
      ...(input.metadata ?? {}),
      provider_account_ref: input.account.provider_account_ref ?? null,
      provider_profile_ref: input.account.provider_profile_ref ?? null,
      provider_context_ref: input.account.provider_context_ref ?? null,
    },
  })

  try {
    const provider = await createProviderTakeoverSession({
      account: input.account,
      connectSessionId: session.id,
      returnUrl: input.returnUrl ?? undefined,
      expiresAt,
    })
    const connected = await updateBrowserOperatorConnectSession({
      orgId: input.orgId,
      connectSessionId: session.id,
      patch: {
        status: provider.status,
        takeover_url: provider.takeoverUrl,
        live_view_url: provider.liveViewUrl,
        provider_session_ref: provider.providerSessionRef,
        provider_profile_ref: provider.providerProfileRef,
        provider_context_ref: provider.providerContextRef,
        expires_at: provider.expiresAt ?? expiresAt,
        metadata: {
          ...(session.metadata ?? {}),
          ...(provider.metadata ?? {}),
        },
      },
    })

    await updateBrowserOperatorAccount({
      orgId: input.orgId,
      accountId: input.account.id,
      patch: {
        auth_state: 'needs_connect',
        provider_profile_ref: provider.providerProfileRef ?? input.account.provider_profile_ref,
        provider_context_ref: provider.providerContextRef ?? input.account.provider_context_ref,
        metadata: {
          ...(input.account.metadata ?? {}),
          latest_connect_session_id: connected.id,
          latest_connect_session_status: connected.status,
          latest_connect_session_requested_at: new Date().toISOString(),
        },
      },
    })

    await recordBrowserOperatorAuditEvent({
      orgId: input.orgId,
      browserAccountId: input.account.id,
      actorType: 'user',
      actorId: input.userId,
      eventType: 'connect_session_provider_ready',
      result: connected.status,
      metadata: {
        provider: input.account.provider,
        connect_session_id: connected.id,
        provider_session_ref: connected.provider_session_ref ?? null,
        provider_profile_ref: connected.provider_profile_ref ?? null,
        provider_context_ref: connected.provider_context_ref ?? null,
      },
    })

    return connected
  } catch (error) {
    const failed = await updateBrowserOperatorConnectSession({
      orgId: input.orgId,
      connectSessionId: session.id,
      patch: {
        status: 'failed',
        failure_reason: error instanceof Error ? error.message : 'Provider takeover session failed.',
        metadata: {
          ...(session.metadata ?? {}),
          provider_error: safeError(error),
        },
      },
    })
    await recordBrowserOperatorAuditEvent({
      orgId: input.orgId,
      browserAccountId: input.account.id,
      actorType: 'user',
      actorId: input.userId,
      eventType: 'connect_session_provider_failed',
      severity: 'error',
      result: 'failed',
      reason: failed.failure_reason ?? null,
      metadata: {
        provider: input.account.provider,
        connect_session_id: failed.id,
      },
    })
    throw error
  }
}

async function createProviderTakeoverSession(input: {
  account: BrowserOperatorAccount
  connectSessionId: string
  returnUrl?: string
  expiresAt: string
}): Promise<ProviderConnectionResult> {
  switch (input.account.provider) {
    case 'browserbase':
      assertExternalProvidersEnabled(input.account.provider)
      return createBrowserbaseTakeoverSession(input)
    case 'steel':
      assertExternalProvidersEnabled(input.account.provider)
      return createSteelTakeoverSession(input)
    case 'remote_cdp':
      assertByoProvidersEnabled(input.account.provider)
      return createLucidManagedTakeoverSession(input)
    case 'browserless':
      assertExternalProvidersEnabled(input.account.provider)
      return createLucidManagedTakeoverSession(input)
    case 'lucid_managed':
    case 'playwright':
      return createLucidManagedTakeoverSession(input)
    default:
      throw new AgentCommerceError(
        'provider_unavailable',
        `${input.account.provider} does not support managed account takeover yet.`,
        400,
      )
  }
}

function assertExternalProvidersEnabled(provider: string): void {
  if (envFlag('BROWSER_OPERATOR_EXTERNAL_PROVIDERS_ENABLED')) return
  throw new AgentCommerceError(
    'provider_unavailable',
    `${provider} is disabled. Set BROWSER_OPERATOR_EXTERNAL_PROVIDERS_ENABLED=true to use hosted browser providers.`,
    403,
  )
}

function assertByoProvidersEnabled(provider: string): void {
  if (envFlag('BROWSER_OPERATOR_BYO_PROVIDERS_ENABLED')) return
  throw new AgentCommerceError(
    'provider_unavailable',
    `${provider} is disabled. Set BROWSER_OPERATOR_BYO_PROVIDERS_ENABLED=true to use BYO browser providers.`,
    403,
  )
}

function envFlag(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env[name] ?? '').trim().toLowerCase())
}

async function createBrowserbaseTakeoverSession(input: {
  account: BrowserOperatorAccount
  connectSessionId: string
  returnUrl?: string
  expiresAt: string
}): Promise<ProviderConnectionResult> {
  const apiKey = process.env.BROWSERBASE_API_KEY
  const projectId = process.env.BROWSERBASE_PROJECT_ID
  if (!apiKey || !projectId) {
    throw new AgentCommerceError('provider_unavailable', 'BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are required.', 503)
  }

  const apiUrl = (process.env.BROWSERBASE_API_URL ?? 'https://api.browserbase.com/v1').replace(/\/+$/, '')
  const contextId = input.account.provider_context_ref ?? await createBrowserbaseContext(apiUrl, apiKey, projectId, input)
  const session = await providerFetchJson(`${apiUrl}/sessions`, {
    method: 'POST',
    headers: providerHeaders(apiKey),
    body: JSON.stringify({
      projectId,
      keepAlive: true,
      browserSettings: {
        context: { id: contextId, persist: true },
      },
      metadata: {
        lucid_connect_session_id: input.connectSessionId,
        lucid_browser_account_id: input.account.id,
        merchant_key: input.account.merchant_key,
      },
    }),
  }, 'Browserbase session')

  const sessionId = firstString(session, ['id', 'sessionId'])
  return {
    status: 'provider_ready',
    takeoverUrl: firstString(session, ['connectUrl', 'debuggerUrl', 'liveViewUrl']),
    liveViewUrl: firstString(session, ['liveViewUrl', 'debuggerUrl']),
    providerSessionRef: sessionId,
    providerContextRef: contextId,
    expiresAt: input.expiresAt,
    metadata: { provider_payload_shape: Object.keys(asRecord(session)).sort() },
  }
}

async function createBrowserbaseContext(
  apiUrl: string,
  apiKey: string,
  projectId: string,
  input: {
    account: BrowserOperatorAccount
    connectSessionId: string
  },
): Promise<string> {
  const context = await providerFetchJson(`${apiUrl}/contexts`, {
    method: 'POST',
    headers: providerHeaders(apiKey),
    body: JSON.stringify({
      projectId,
      name: `lucid-${input.account.merchant_key}-${input.account.id.slice(0, 8)}`,
      metadata: {
        lucid_connect_session_id: input.connectSessionId,
        lucid_browser_account_id: input.account.id,
      },
    }),
  }, 'Browserbase context')
  const contextId = firstString(context, ['id', 'contextId'])
  if (!contextId) throw new AgentCommerceError('provider_unavailable', 'Browserbase did not return a context id.', 502)
  return contextId
}

async function createSteelTakeoverSession(input: {
  account: BrowserOperatorAccount
  connectSessionId: string
  returnUrl?: string
  expiresAt: string
}): Promise<ProviderConnectionResult> {
  const apiKey = process.env.STEEL_API_KEY
  if (!apiKey) throw new AgentCommerceError('provider_unavailable', 'STEEL_API_KEY is required.', 503)

  const apiUrl = (process.env.STEEL_API_URL ?? 'https://api.steel.dev/v1').replace(/\/+$/, '')
  const profileId = input.account.provider_profile_ref ?? await createSteelProfile(apiUrl, apiKey, input)
  const session = await providerFetchJson(`${apiUrl}/sessions`, {
    method: 'POST',
    headers: providerHeaders(apiKey),
    body: JSON.stringify({
      profileId,
      useProxy: process.env.STEEL_USE_PROXY === 'true',
      metadata: {
        lucid_connect_session_id: input.connectSessionId,
        lucid_browser_account_id: input.account.id,
        merchant_key: input.account.merchant_key,
      },
    }),
  }, 'Steel session')

  const sessionId = firstString(session, ['id', 'sessionId'])
  return {
    status: 'provider_ready',
    takeoverUrl: firstString(session, ['sessionViewerUrl', 'viewerUrl', 'debugUrl', 'liveUrl']),
    liveViewUrl: firstString(session, ['sessionViewerUrl', 'viewerUrl', 'debugUrl', 'liveUrl']),
    providerSessionRef: sessionId,
    providerProfileRef: profileId,
    expiresAt: input.expiresAt,
    metadata: { provider_payload_shape: Object.keys(asRecord(session)).sort() },
  }
}

async function createSteelProfile(
  apiUrl: string,
  apiKey: string,
  input: {
    account: BrowserOperatorAccount
    connectSessionId: string
  },
): Promise<string> {
  const profile = await providerFetchJson(`${apiUrl}/profiles`, {
    method: 'POST',
    headers: providerHeaders(apiKey),
    body: JSON.stringify({
      name: `lucid-${input.account.merchant_key}-${input.account.id.slice(0, 8)}`,
      metadata: {
        lucid_connect_session_id: input.connectSessionId,
        lucid_browser_account_id: input.account.id,
      },
    }),
  }, 'Steel profile')
  const profileId = firstString(profile, ['id', 'profileId'])
  if (!profileId) throw new AgentCommerceError('provider_unavailable', 'Steel did not return a profile id.', 502)
  return profileId
}

function createLucidManagedTakeoverSession(input: {
  account: BrowserOperatorAccount
  connectSessionId: string
  returnUrl?: string
  expiresAt: string
}): ProviderConnectionResult {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? '').replace(/\/+$/, '')
  const takeoverPath = takeoverPathFromReturnUrl(input.returnUrl, input.connectSessionId)
  const takeoverOrigin = baseUrl || originFromUrl(input.returnUrl)
  return {
    status: 'provider_ready',
    takeoverUrl: takeoverOrigin ? `${takeoverOrigin}${takeoverPath}` : undefined,
    liveViewUrl: undefined,
    providerSessionRef: input.connectSessionId,
    providerProfileRef: input.account.provider_profile_ref ?? `lucid:${input.account.id}`,
    expiresAt: input.expiresAt,
    metadata: {
      takeover_path: takeoverPath,
      execution_provider: input.account.provider,
    },
  }
}

function originFromUrl(value: string | undefined): string {
  if (!value) return ''
  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

function takeoverPathFromReturnUrl(returnUrl: string | undefined, connectSessionId: string): string {
  if (!returnUrl) return `/mission-control/browser/connect/${connectSessionId}`
  try {
    const url = new URL(returnUrl)
    const marker = '/mission-control/browser'
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex >= 0) {
      return `${url.pathname.slice(0, markerIndex)}${marker}/connect/${connectSessionId}`
    }
  } catch {
    // Fall through to the generic path.
  }
  return `/mission-control/browser/connect/${connectSessionId}`
}

async function providerFetchJson(url: string, init: RequestInit, label: string): Promise<unknown> {
  const response = await fetch(url, init)
  const text = await response.text()
  const body = text ? safeJson(text) : {}
  if (!response.ok) {
    throw new AgentCommerceError(
      'provider_unavailable',
      `${label} request failed (${response.status}).`,
      502,
      {
        details: { provider_status: response.status, provider_body: redactProviderBody(body) },
        retryable: response.status >= 500,
      },
    )
  }
  return body
}

function providerHeaders(apiKey: string): HeadersInit {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
    'x-api-key': apiKey,
  }
}

function firstString(value: unknown, keys: string[]): string | undefined {
  const record = asRecord(value)
  for (const key of keys) {
    const item = record[key]
    if (typeof item === 'string' && item.trim()) return item
  }
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return { body_preview: value.slice(0, 500) }
  }
}

function safeError(error: unknown): Record<string, unknown> {
  if (error instanceof AgentCommerceError) return { code: error.code, message: error.message, status: error.status }
  if (error instanceof Error) return { message: error.message }
  return { message: 'unknown error' }
}

function redactProviderBody(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = /token|secret|key|password|credential/i.test(key)
      ? '[redacted]'
      : item
  }
  return output
}
