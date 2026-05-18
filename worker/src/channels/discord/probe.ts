const DISCORD_API_BASE = 'https://discord.com/api/v10'

export type DiscordPrivilegedIntentStatus = 'enabled' | 'limited' | 'disabled'

export interface DiscordPrivilegedIntentsSummary {
  messageContent: DiscordPrivilegedIntentStatus
  guildMembers: DiscordPrivilegedIntentStatus
  presence: DiscordPrivilegedIntentStatus
}

export interface DiscordApplicationSummary {
  id?: string | null
  flags?: number | null
  intents?: DiscordPrivilegedIntentsSummary
}

export interface DiscordProbeResult {
  ok: boolean
  status: number | null
  error: string | null
  elapsedMs: number
  bot?: { id?: string | null; username?: string | null }
  application?: DiscordApplicationSummary
}

const DISCORD_APP_FLAG_GATEWAY_PRESENCE = 1 << 12
const DISCORD_APP_FLAG_GATEWAY_PRESENCE_LIMITED = 1 << 13
const DISCORD_APP_FLAG_GATEWAY_GUILD_MEMBERS = 1 << 14
const DISCORD_APP_FLAG_GATEWAY_GUILD_MEMBERS_LIMITED = 1 << 15
const DISCORD_APP_FLAG_GATEWAY_MESSAGE_CONTENT = 1 << 18
const DISCORD_APP_FLAG_GATEWAY_MESSAGE_CONTENT_LIMITED = 1 << 19

function normalizeDiscordToken(token: string | null | undefined): string | null {
  const normalized = token?.trim()
  return normalized ? normalized : null
}

function resolveDiscordPrivilegedIntentsFromFlags(
  flags: number,
): DiscordPrivilegedIntentsSummary {
  const resolve = (enabledBit: number, limitedBit: number): DiscordPrivilegedIntentStatus => {
    if ((flags & enabledBit) !== 0) return 'enabled'
    if ((flags & limitedBit) !== 0) return 'limited'
    return 'disabled'
  }

  return {
    presence: resolve(DISCORD_APP_FLAG_GATEWAY_PRESENCE, DISCORD_APP_FLAG_GATEWAY_PRESENCE_LIMITED),
    guildMembers: resolve(
      DISCORD_APP_FLAG_GATEWAY_GUILD_MEMBERS,
      DISCORD_APP_FLAG_GATEWAY_GUILD_MEMBERS_LIMITED,
    ),
    messageContent: resolve(
      DISCORD_APP_FLAG_GATEWAY_MESSAGE_CONTENT,
      DISCORD_APP_FLAG_GATEWAY_MESSAGE_CONTENT_LIMITED,
    ),
  }
}

async function fetchDiscordApplicationSummary(
  token: string,
  timeoutMs: number,
): Promise<DiscordApplicationSummary | undefined> {
  const response = await fetch(
    `${DISCORD_API_BASE}/oauth2/applications/@me`,
    {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    },
  ).catch(() => null)

  if (!response?.ok) return undefined

  const json = await response.json() as { id?: string; flags?: number }
  const flags =
    typeof json.flags === 'number' && Number.isFinite(json.flags) ? json.flags : undefined

  return {
    id: json.id ?? null,
    flags: flags ?? null,
    intents: typeof flags === 'number' ? resolveDiscordPrivilegedIntentsFromFlags(flags) : undefined,
  }
}

export async function probeDiscord(
  token: string | null | undefined,
  timeoutMs = 2500,
  includeApplication = true,
): Promise<DiscordProbeResult> {
  const started = Date.now()
  const normalized = normalizeDiscordToken(token)

  if (!normalized) {
    return {
      ok: false,
      status: null,
      error: 'missing token',
      elapsedMs: Date.now() - started,
    }
  }

  try {
    const response = await fetch(
      `${DISCORD_API_BASE}/users/@me`,
      {
        headers: { Authorization: `Bot ${normalized}` },
        signal: AbortSignal.timeout(timeoutMs),
      },
    )

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `getMe failed (${response.status})`,
        elapsedMs: Date.now() - started,
      }
    }

    const json = await response.json() as { id?: string; username?: string }
    const application = includeApplication
      ? await fetchDiscordApplicationSummary(normalized, timeoutMs)
      : undefined

    return {
      ok: true,
      status: response.status,
      error: null,
      elapsedMs: Date.now() - started,
      bot: {
        id: json.id ?? null,
        username: json.username ?? null,
      },
      application,
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started,
    }
  }
}
