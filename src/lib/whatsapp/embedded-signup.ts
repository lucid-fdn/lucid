import 'server-only'

const META_GRAPH_VERSION = 'v23.0'

export interface WhatsAppEmbeddedSignupConfig {
  appId: string
  appSecret: string
  configId: string
}

export function getWhatsAppEmbeddedSignupConfig(): WhatsAppEmbeddedSignupConfig {
  const appId = process.env.WHATSAPP_EMBEDDED_SIGNUP_APP_ID?.trim()
  const appSecret = process.env.WHATSAPP_EMBEDDED_SIGNUP_APP_SECRET?.trim()
  const configId = process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim()

  if (!appId || !appSecret || !configId) {
    throw new Error('WhatsApp Embedded Signup is not fully configured')
  }

  return { appId, appSecret, configId }
}

export async function exchangeWhatsAppEmbeddedSignupCode(params: {
  appId: string
  appSecret: string
  code: string
}): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`)
  url.searchParams.set('client_id', params.appId)
  url.searchParams.set('client_secret', params.appSecret)
  url.searchParams.set('code', params.code)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  const payload = (await response.json().catch(() => null)) as
    | { access_token?: string; error?: { message?: string } }
    | null

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error?.message ||
        `WhatsApp Embedded Signup code exchange failed (${response.status})`,
    )
  }

  return payload.access_token
}
