const teamsTokenEntries = new Map<string, { token: string; expiresAt: number }>()
const teamsTokenInflight = new Map<string, Promise<string>>()

function getCacheKey(appId: string, tenantId: string): string {
  return `${appId}:${tenantId}`
}

function invalidateTeamsToken(appId: string, tenantId: string): void {
  teamsTokenEntries.delete(getCacheKey(appId, tenantId))
  teamsTokenInflight.delete(getCacheKey(appId, tenantId))
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
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

async function getTeamsAccessToken(
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

async function sendTeamsText(params: {
  appId: string
  appPassword: string
  tenantId: string
  serviceUrl: string
  conversationId: string
  text: string
  replyToActivityId?: string | null
}): Promise<{ externalMessageId: string | null }> {
  const sendWithToken = async (token: string): Promise<Response> =>
    fetchWithRetry(
      `${params.serviceUrl}/v3/conversations/${encodeURIComponent(params.conversationId)}/activities`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'message',
          text: params.text,
          ...(params.replyToActivityId ? { replyToId: params.replyToActivityId } : {}),
        }),
      },
    )

  let token = await getTeamsAccessToken(params.appId, params.appPassword, params.tenantId)
  let res = await sendWithToken(token)

  if (res.status === 401) {
    invalidateTeamsToken(params.appId, params.tenantId)
    token = await getTeamsAccessToken(params.appId, params.appPassword, params.tenantId)
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

export interface TeamsOutboundEvent {
  inbound_event_id: string | null
  message_text: string
  reply_to_external_id: string | null
}

export interface TeamsOutboundChannel {
  id: string
  external_channel_id: string | null
  channel_config?: Record<string, unknown> | null
}

export async function handleTeamsOutbound(params: {
  channel: TeamsOutboundChannel
  event: TeamsOutboundEvent
  secrets: Record<string, string>
  loadInboundMessageData: (inboundEventId: string | null) => Promise<Record<string, unknown> | null>
}): Promise<string | null> {
  const shouldLoadInboundMessageData =
    !params.channel.external_channel_id ||
    !params.secrets.service_url ||
    !(
      params.channel.channel_config &&
      typeof params.channel.channel_config === 'object' &&
      typeof params.channel.channel_config.teams_service_url === 'string' &&
      params.channel.channel_config.teams_service_url.trim().length > 0
    )

  const inboundMessageData = shouldLoadInboundMessageData
    ? await params.loadInboundMessageData(params.event.inbound_event_id)
    : null

  const conversationId =
    typeof params.channel.external_channel_id === 'string' &&
    params.channel.external_channel_id.trim().length > 0
      ? params.channel.external_channel_id.trim()
      : typeof inboundMessageData?.teams_conversation_id === 'string' &&
          inboundMessageData.teams_conversation_id.trim().length > 0
        ? inboundMessageData.teams_conversation_id.trim()
        : null
  if (!conversationId) {
    throw new Error('Teams outbound recipient conversation is missing')
  }

  const appId = params.secrets.app_id
  const appPassword = params.secrets.app_password
  const tenantId =
    params.secrets.tenant_id ||
    (typeof inboundMessageData?.teams_tenant_id === 'string' && inboundMessageData.teams_tenant_id.trim().length > 0
      ? inboundMessageData.teams_tenant_id.trim()
      : 'common')
  const serviceUrl =
    params.secrets.service_url ||
    (params.channel.channel_config &&
    typeof params.channel.channel_config === 'object' &&
    typeof params.channel.channel_config.teams_service_url === 'string' &&
    params.channel.channel_config.teams_service_url.trim().length > 0
      ? params.channel.channel_config.teams_service_url.trim()
      : null) ||
    (typeof inboundMessageData?.serviceUrl === 'string' && inboundMessageData.serviceUrl.trim().length > 0
      ? inboundMessageData.serviceUrl.trim()
      : 'https://smba.trafficmanager.net/teams')

  if (!appId || !appPassword) {
    throw new Error('Teams app credentials not configured (app_id + app_password required)')
  }

  const result = await sendTeamsText({
    appId,
    appPassword,
    tenantId,
    serviceUrl,
    conversationId,
    text: params.event.message_text,
    replyToActivityId: params.event.reply_to_external_id,
  })

  return result.externalMessageId
}
