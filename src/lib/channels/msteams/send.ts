import 'server-only'

type TeamsTokenEntry = {
  token: string
  expiresAt: number
}

const teamsTokenEntries = new Map<string, TeamsTokenEntry>()
const teamsTokenInflight = new Map<string, Promise<string>>()

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok || res.status < 500) return res
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }

  throw lastError ?? new Error('Teams request failed after retries')
}

function getCacheKey(appId: string, tenantId: string): string {
  return `${appId}:${tenantId}`
}

export function invalidateTeamsToken(appId: string, tenantId: string): void {
  teamsTokenEntries.delete(getCacheKey(appId, tenantId))
  teamsTokenInflight.delete(getCacheKey(appId, tenantId))
}

export async function getTeamsAccessToken(
  appId: string,
  appPassword: string,
  tenantId: string,
): Promise<string> {
  const cacheKey = getCacheKey(appId, tenantId)
  const cached = teamsTokenEntries.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 300_000) {
    return cached.token
  }

  const existingInflight = teamsTokenInflight.get(cacheKey)
  if (existingInflight) {
    return existingInflight
  }

  const inflight = (async () => {
    try {
      const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: appId,
        client_secret: appPassword,
        scope: 'https://api.botframework.com/.default',
      })

      const res = await fetchWithRetry(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })

      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error(`Teams OAuth: ${res.status} - app credentials invalid`), {
          status: res.status,
        })
      }

      const data = (await res.json()) as {
        access_token?: string
        expires_in?: number
        error?: string
      }

      if (!data.access_token) {
        throw new Error(`Teams OAuth token error: ${data.error || 'no access_token in response'}`)
      }

      teamsTokenEntries.set(cacheKey, {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      })

      return data.access_token
    } finally {
      teamsTokenInflight.delete(cacheKey)
    }
  })()

  teamsTokenInflight.set(cacheKey, inflight)
  return inflight
}

export async function sendTeamsActivity(params: {
  appId: string
  appPassword: string
  tenantId?: string | null
  serviceUrl?: string | null
  conversationId: string
  activity: Record<string, unknown>
}): Promise<{ externalMessageId: string | null }> {
  const tenantId = params.tenantId || 'common'
  const serviceUrl = params.serviceUrl || 'https://smba.trafficmanager.net/teams'

  const sendWithToken = async (token: string): Promise<Response> =>
    fetchWithRetry(
      `${serviceUrl}/v3/conversations/${encodeURIComponent(params.conversationId)}/activities`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(params.activity),
      },
    )

  let token = await getTeamsAccessToken(params.appId, params.appPassword, tenantId)
  let res = await sendWithToken(token)

  if (res.status === 401) {
    invalidateTeamsToken(params.appId, tenantId)
    token = await getTeamsAccessToken(params.appId, params.appPassword, tenantId)
    res = await sendWithToken(token)
  }

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error(`Teams: auth failed (${res.status})`), { status: res.status })
  }
  if (res.status === 404) {
    throw Object.assign(new Error('Teams: conversation not found (404)'), { status: 404 })
  }
  if (!res.ok) {
    throw new Error(`Teams: ${res.status}`)
  }

  const data = (await res.json()) as { id?: string }
  return { externalMessageId: data.id ?? null }
}

export async function sendTeamsText(params: {
  appId: string
  appPassword: string
  tenantId?: string | null
  serviceUrl?: string | null
  conversationId: string
  text: string
  replyToActivityId?: string | null
}): Promise<{ externalMessageId: string | null }> {
  const activity: Record<string, unknown> = {
    type: 'message',
    text: params.text,
  }

  if (params.replyToActivityId) {
    activity.replyToId = params.replyToActivityId
  }

  return sendTeamsActivity({
    appId: params.appId,
    appPassword: params.appPassword,
    tenantId: params.tenantId,
    serviceUrl: params.serviceUrl,
    conversationId: params.conversationId,
    activity,
  })
}
