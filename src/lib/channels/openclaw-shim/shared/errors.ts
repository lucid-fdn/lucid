import 'server-only'

/**
 * Permanent channel failure — the channel credentials are revoked, the bot
 * was kicked, or permissions were removed. The outbound-delivery layer should
 * NOT retry and SHOULD mark the channel as needing reconnection.
 */
export class PermanentChannelError extends Error {
  readonly kind: 'auth_revoked' | 'missing_permissions' | 'dm_blocked' | 'channel_gone'
  readonly httpStatus?: number
  readonly channelId?: string

  constructor(
    message: string,
    init: {
      kind: 'auth_revoked' | 'missing_permissions' | 'dm_blocked' | 'channel_gone'
      httpStatus?: number
      channelId?: string
      cause?: unknown
    },
  ) {
    super(message, { cause: init.cause })
    this.name = 'PermanentChannelError'
    this.kind = init.kind
    this.httpStatus = init.httpStatus
    this.channelId = init.channelId
  }
}

type UnknownErrorShape = {
  name?: string
  message?: string
  kind?: string
  channelId?: string
  missingPermissions?: string[]
  status?: number
  statusCode?: number
  httpStatus?: number
  cause?: unknown
}

function asRecord(err: unknown): UnknownErrorShape {
  if (err && typeof err === 'object') return err as UnknownErrorShape
  return {}
}

/**
 * Inspect an error thrown by `sendMessageDiscord` / `editMessageDiscord` (or a
 * raw HTTP-ish error) and decide whether to re-throw it as a permanent failure
 * or let the caller's retry logic handle it as transient.
 *
 * We deliberately cast wide — OpenClaw's `DiscordSendError` is a concrete class
 * upstream, but re-exporting it through the compiled runtime package loses the
 * instanceof identity. Rely on shape + name matching instead.
 */
export function classifyDiscordError(err: unknown): PermanentChannelError | null {
  const shape = asRecord(err)
  const name = shape.name ?? ''
  const msg = shape.message ?? String(err ?? '')
  const status = shape.httpStatus ?? shape.status ?? shape.statusCode

  // OpenClaw-tagged structured errors
  if (name === 'DiscordSendError') {
    if (shape.kind === 'missing-permissions') {
      return new PermanentChannelError(msg || 'Discord: missing permissions', {
        kind: 'missing_permissions',
        channelId: shape.channelId,
        cause: err,
      })
    }
    if (shape.kind === 'dm-blocked') {
      return new PermanentChannelError(msg || 'Discord: DM blocked', {
        kind: 'dm_blocked',
        channelId: shape.channelId,
        cause: err,
      })
    }
  }

  // HTTP status heuristics (covers both raw fetch errors and OpenClaw errors
  // that surface a status field)
  if (status === 401 || status === 403) {
    return new PermanentChannelError(msg || `Discord auth revoked (${status})`, {
      kind: 'auth_revoked',
      httpStatus: status,
      channelId: shape.channelId,
      cause: err,
    })
  }
  if (status === 404) {
    return new PermanentChannelError(msg || 'Discord channel gone (404)', {
      kind: 'channel_gone',
      httpStatus: status,
      channelId: shape.channelId,
      cause: err,
    })
  }

  // Message-string fallback for nested errors where status didn't propagate.
  if (/\b401\b|\b403\b|unauthoriz/i.test(msg)) {
    return new PermanentChannelError(msg, {
      kind: 'auth_revoked',
      channelId: shape.channelId,
      cause: err,
    })
  }

  return null
}

/**
 * Inspect an error thrown by `sendMessageSlack` / `editSlackMessage` and
 * decide whether to re-throw as a permanent failure or let the caller retry.
 *
 * Slack Web API errors carry a `code` string (e.g. `'slack_webapi_platform_error'`)
 * and a `data.error` string (e.g. `'not_authed'`, `'invalid_auth'`, `'channel_not_found'`).
 * We cast wide and also check `message` for these markers.
 */
export function classifySlackError(err: unknown): PermanentChannelError | null {
  const shape = asRecord(err) as UnknownErrorShape & {
    data?: { error?: string }
    code?: string
  }
  const msg = shape.message ?? String(err ?? '')
  const status = shape.httpStatus ?? shape.status ?? shape.statusCode
  const slackError = shape.data?.error ?? ''

  // Slack API platform errors — permanent auth failures
  const permanentAuthErrors = new Set([
    'not_authed',
    'invalid_auth',
    'account_inactive',
    'token_revoked',
    'token_expired',
    'missing_scope',
  ])
  if (permanentAuthErrors.has(slackError)) {
    return new PermanentChannelError(msg || `Slack auth error: ${slackError}`, {
      kind: 'auth_revoked',
      channelId: shape.channelId,
      cause: err,
    })
  }

  // Channel gone
  const channelGoneErrors = new Set([
    'channel_not_found',
    'is_archived',
  ])
  if (channelGoneErrors.has(slackError)) {
    return new PermanentChannelError(msg || `Slack channel gone: ${slackError}`, {
      kind: 'channel_gone',
      channelId: shape.channelId,
      cause: err,
    })
  }

  // Bot not in channel or permission denied
  const permissionErrors = new Set([
    'not_in_channel',
    'restricted_action',
    'no_permission',
    'cannot_dm_bot',
  ])
  if (permissionErrors.has(slackError)) {
    return new PermanentChannelError(msg || `Slack: ${slackError}`, {
      kind: 'missing_permissions',
      channelId: shape.channelId,
      cause: err,
    })
  }

  // HTTP status heuristics
  if (status === 401 || status === 403) {
    return new PermanentChannelError(msg || `Slack auth revoked (${status})`, {
      kind: 'auth_revoked',
      httpStatus: status,
      channelId: shape.channelId,
      cause: err,
    })
  }

  // Message-string fallback
  if (/\bnot_authed\b|\binvalid_auth\b|\btoken_revoked\b/i.test(msg)) {
    return new PermanentChannelError(msg, {
      kind: 'auth_revoked',
      channelId: shape.channelId,
      cause: err,
    })
  }

  return null
}

/**
 * Inspect an error thrown by the WhatsApp Cloud API sender and decide whether
 * to re-throw it as a permanent failure or let the caller retry.
 *
 * Lucid's hosted/managed WhatsApp path currently talks to Meta's Cloud API
 * directly rather than through a `@lucid/openclaw-runtime` export, but it
 * still benefits from the same permanent-vs-transient split as the other
 * managed transports.
 */
export function classifyWhatsAppError(err: unknown): PermanentChannelError | null {
  const shape = asRecord(err) as UnknownErrorShape & {
    body?: { error?: { message?: string; code?: number; error_subcode?: number } }
    code?: string | number
  }
  const msg = shape.message ?? String(err ?? '')
  const status = shape.httpStatus ?? shape.status ?? shape.statusCode
  const graphMessage = shape.body?.error?.message ?? msg

  if (status === 401 || status === 403) {
    return new PermanentChannelError(graphMessage || `WhatsApp auth revoked (${status})`, {
      kind: 'auth_revoked',
      httpStatus: status,
      channelId: shape.channelId,
      cause: err,
    })
  }

  if (status === 404) {
    return new PermanentChannelError(graphMessage || 'WhatsApp destination gone (404)', {
      kind: 'channel_gone',
      httpStatus: 404,
      channelId: shape.channelId,
      cause: err,
    })
  }

  if (/permission|not authorized|missing permission/i.test(graphMessage)) {
    return new PermanentChannelError(graphMessage, {
      kind: 'missing_permissions',
      channelId: shape.channelId,
      cause: err,
    })
  }

  if (/access token|invalid oauth|expired access token|oauth/i.test(graphMessage)) {
    return new PermanentChannelError(graphMessage, {
      kind: 'auth_revoked',
      channelId: shape.channelId,
      cause: err,
    })
  }

  if (/unsupported post request|does not exist|no matching user found/i.test(graphMessage)) {
    return new PermanentChannelError(graphMessage, {
      kind: 'channel_gone',
      channelId: shape.channelId,
      cause: err,
    })
  }

  return null
}

/**
 * Inspect an error thrown by `sendMessageTelegram` / `editMessageTelegram`
 * (grammy `GrammyError` or a raw HTTP-ish failure) and decide whether to
 * re-throw it as a permanent failure or let the caller retry.
 *
 * grammy errors carry `error_code` (HTTP status from Bot API) and a
 * `description` string. Bot API surfaces a narrow set of permanent failures
 * we can detect deterministically:
 *   - 401: invalid/revoked token
 *   - 403: bot blocked or kicked from chat (DM-blocked analogue)
 *   - 400 "chat not found": channel gone
 */
/**
 * Inspect an error thrown by `sendMessageMSTeams` / Bot Framework REST
 * calls and decide whether to re-throw as a permanent failure or let the
 * caller retry.
 *
 * Teams Bot Framework errors carry HTTP status codes and structured error
 * codes in the response body. Key permanent failures:
 *   - 401/403: app credentials revoked or invalid
 *   - 404 with "conversation not found": channel gone
 *   - BotNotInConversationRoster: bot not added to team
 */
export function classifyTeamsError(err: unknown): PermanentChannelError | null {
  const shape = asRecord(err) as UnknownErrorShape & {
    code?: string
    body?: { error?: { code?: string; message?: string } }
  }
  const msg = shape.message ?? String(err ?? '')
  const status = shape.httpStatus ?? shape.status ?? shape.statusCode
  const bodyCode = shape.body?.error?.code ?? shape.code ?? ''

  // Auth revoked
  if (status === 401 || status === 403) {
    return new PermanentChannelError(msg || `Teams auth revoked (${status})`, {
      kind: 'auth_revoked',
      httpStatus: status,
      channelId: shape.channelId,
      cause: err,
    })
  }

  // Conversation/channel gone
  if (status === 404) {
    return new PermanentChannelError(msg || 'Teams conversation not found (404)', {
      kind: 'channel_gone',
      httpStatus: 404,
      channelId: shape.channelId,
      cause: err,
    })
  }

  // Bot not added to team roster
  if (/BotNotInConversationRoster/i.test(msg) || /BotNotInConversationRoster/i.test(bodyCode)) {
    return new PermanentChannelError(msg || 'Teams: bot not in conversation roster', {
      kind: 'missing_permissions',
      channelId: shape.channelId,
      cause: err,
    })
  }

  // Proxy revocation (TypeError from broken credentials)
  if (err instanceof TypeError && /revoked|invalid.*credential/i.test(msg)) {
    return new PermanentChannelError(msg, {
      kind: 'auth_revoked',
      channelId: shape.channelId,
      cause: err,
    })
  }

  // Message-string fallback
  if (/\b401\b|\b403\b|unauthoriz/i.test(msg)) {
    return new PermanentChannelError(msg, {
      kind: 'auth_revoked',
      channelId: shape.channelId,
      cause: err,
    })
  }

  // 429, 5xx → transient (return null, let retry logic handle)
  return null
}

export function classifyTelegramError(err: unknown): PermanentChannelError | null {
  const shape = asRecord(err) as UnknownErrorShape & {
    error_code?: number
    description?: string
  }
  const msg = shape.description ?? shape.message ?? String(err ?? '')
  const status = shape.error_code ?? shape.httpStatus ?? shape.status ?? shape.statusCode

  if (status === 401) {
    return new PermanentChannelError(msg || 'Telegram auth revoked (401)', {
      kind: 'auth_revoked',
      httpStatus: 401,
      channelId: shape.channelId,
      cause: err,
    })
  }
  if (status === 403) {
    return new PermanentChannelError(msg || 'Telegram: bot blocked or kicked (403)', {
      kind: 'dm_blocked',
      httpStatus: 403,
      channelId: shape.channelId,
      cause: err,
    })
  }
  if (status === 400 && /chat not found/i.test(msg)) {
    return new PermanentChannelError(msg, {
      kind: 'channel_gone',
      httpStatus: 400,
      channelId: shape.channelId,
      cause: err,
    })
  }

  // Fallback: message-string scan catches errors wrapped by retry helpers
  // where the status field didn't propagate through the layers.
  if (/unauthorized|invalid token|token.*revoked/i.test(msg)) {
    return new PermanentChannelError(msg, {
      kind: 'auth_revoked',
      channelId: shape.channelId,
      cause: err,
    })
  }

  return null
}
