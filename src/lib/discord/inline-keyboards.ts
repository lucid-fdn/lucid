/**
 * Discord component builders + HMAC'd custom_id schema.
 *
 * Discord components (buttons, select menus, modals) ship a `custom_id`
 * string that the client echoes back verbatim on interaction. We use the
 * custom_id to carry state (which action, which guild, which expiry) and
 * stamp every payload with a truncated HMAC so a user can't hand-craft
 * one or replay a stale one across guilds.
 *
 * Format: `<action>:<args...>:<exp>:<sig>`
 *
 *   action   — verb: agents_select | leave_confirm | agents_page | ...
 *   args     — zero or more colon-separated fields (no `:` inside)
 *   exp      — unix seconds
 *   sig      — first 16 hex chars (8 bytes) of HMAC-SHA256 over everything
 *              before `:<sig>`, using DISCORD_HOSTED_INTERACTION_SECRET
 *
 * Discord's custom_id cap is 100 chars. We enforce 100 on the emit side
 * AND on the parse side — anything longer is a forged or stale payload.
 *
 * Spec: docs/plans/2026-04-08-discord-byob-and-shared-bot.md §2h
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Discord custom_id cap. */
export const DISCORD_CUSTOM_ID_MAX_BYTES = 100

/** HMAC signature length in hex chars (8 bytes → 16 hex chars). */
const SIG_HEX_LEN = 16

/** Default lifetime for stateful custom_ids (15 minutes). */
const DEFAULT_TTL_SECONDS = 15 * 60

/** Discord component types we emit. */
export const COMPONENT_TYPE = {
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
} as const

/** Discord button styles. */
export const BUTTON_STYLE = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
  LINK: 5,
} as const

export interface DiscordButton {
  type: typeof COMPONENT_TYPE.BUTTON
  style: number
  label: string
  custom_id?: string
  url?: string
  disabled?: boolean
}

export interface DiscordStringSelectOption {
  label: string
  value: string
  description?: string
  default?: boolean
}

export interface DiscordStringSelect {
  type: typeof COMPONENT_TYPE.STRING_SELECT
  custom_id: string
  placeholder?: string
  min_values?: number
  max_values?: number
  options: DiscordStringSelectOption[]
  disabled?: boolean
}

export interface DiscordActionRow<
  T extends DiscordButton | DiscordStringSelect = DiscordButton | DiscordStringSelect,
> {
  type: typeof COMPONENT_TYPE.ACTION_ROW
  components: T[]
}

function getSecret(override?: string): Buffer {
  const key = override ?? process.env.DISCORD_HOSTED_INTERACTION_SECRET
  if (!key || key.length < 32) {
    throw new Error(
      'DISCORD_HOSTED_INTERACTION_SECRET is missing or too short (min 32 chars). Generate with `openssl rand -hex 32`.',
    )
  }
  return Buffer.from(key, 'utf8')
}

function sign(material: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(material).digest('hex').slice(0, SIG_HEX_LEN)
}

export interface SignCustomIdOptions {
  action: string
  /** Zero or more path segments. Must not contain `:`. */
  args?: ReadonlyArray<string>
  /** Override for tests — normally read from env. */
  secret?: string
  /** Override for tests — normally `Date.now()`. */
  now?: number
  /** Override TTL in seconds. */
  ttlSeconds?: number
}

/**
 * Build a signed Discord custom_id. Throws if the result exceeds
 * Discord's 100-byte cap — that's a programmer error, not a runtime
 * condition, so failing loud is the right call.
 */
export function signCustomId(opts: SignCustomIdOptions): string {
  const args = opts.args ?? []
  for (const a of args) {
    if (a.includes(':')) {
      throw new Error(`signCustomId: arg "${a}" contains forbidden ":" separator`)
    }
  }
  if (opts.action.includes(':')) {
    throw new Error(`signCustomId: action "${opts.action}" contains forbidden ":" separator`)
  }

  const now = opts.now ?? Date.now()
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS
  const exp = Math.floor(now / 1000) + ttl

  const prefix = [opts.action, ...args, String(exp)].join(':')
  const sig = sign(prefix, getSecret(opts.secret))
  const full = `${prefix}:${sig}`

  if (Buffer.byteLength(full, 'utf8') > DISCORD_CUSTOM_ID_MAX_BYTES) {
    throw new Error(
      `signCustomId: result exceeds Discord custom_id cap (${Buffer.byteLength(full, 'utf8')} > ${DISCORD_CUSTOM_ID_MAX_BYTES}): ${full}`,
    )
  }
  return full
}

export interface ParsedCustomId {
  action: string
  args: string[]
  expiresAt: number
}

/**
 * Verify and parse a signed custom_id. Returns null on any failure
 * (bad format, bad signature, expired, oversized). Constant-time
 * signature comparison.
 *
 * Pass `expectedAction` to bind parsing to a specific verb — callers
 * that expect a select menu payload should not accept a button payload
 * with the same signing key, even if the signature validates.
 */
export function verifyCustomId(
  customId: string,
  options: { expectedAction?: string; secret?: string; now?: number } = {},
): ParsedCustomId | null {
  if (typeof customId !== 'string' || customId.length === 0) return null
  if (Buffer.byteLength(customId, 'utf8') > DISCORD_CUSTOM_ID_MAX_BYTES) return null

  const lastColon = customId.lastIndexOf(':')
  if (lastColon <= 0) return null

  const prefix = customId.slice(0, lastColon)
  const sigHex = customId.slice(lastColon + 1)
  if (sigHex.length !== SIG_HEX_LEN) return null
  if (!/^[0-9a-f]+$/.test(sigHex)) return null

  let secret: Buffer
  try {
    secret = getSecret(options.secret)
  } catch {
    return null
  }

  const expectedSig = sign(prefix, secret)
  const expectedBuf = Buffer.from(expectedSig, 'utf8')
  const actualBuf = Buffer.from(sigHex, 'utf8')
  if (expectedBuf.length !== actualBuf.length) return null
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null

  // Signature good — now parse fields.
  const parts = prefix.split(':')
  if (parts.length < 2) return null // need at least action + exp
  const expStr = parts[parts.length - 1]
  const exp = Number.parseInt(expStr ?? '', 10)
  if (!Number.isFinite(exp)) return null
  const nowSec = Math.floor((options.now ?? Date.now()) / 1000)
  if (exp < nowSec) return null

  const action = parts[0]
  if (!action) return null
  const args = parts.slice(1, -1)

  if (options.expectedAction && action !== options.expectedAction) return null

  return { action, args, expiresAt: exp }
}

// ────────────────────────────────────────────────────────────────────
// High-level component builders
// ────────────────────────────────────────────────────────────────────

export interface GuildBinding {
  id: string
  assistant_id: string
  assistant_name: string
  assistant_description?: string | null
  is_primary: boolean
}

export interface GuildModelChoice {
  id: string
  name: string
  provider: string
  is_current?: boolean
}

/** Discord string-select option cap. */
export const SELECT_OPTIONS_MAX = 25

export interface AgentsComponentOptions {
  guildId: string
  userId: string
  secret?: string
  now?: number
  /** Page index when paginating — default 0. */
  page?: number
}

/**
 * Build the component block shown by `/agents`.
 *
 * When the guild has ≤25 bindings: render a single String Select Menu
 * with one option per agent. The primary agent is marked with a ✓ in
 * its label. The custom_id is bound to the guild via HMAC so a
 * select payload stolen from one guild can't be replayed in another.
 *
 * When the guild has >25 bindings: render the 25-window page PLUS a
 * Prev/Next button row. Each button's custom_id is signed and carries
 * the target page number.
 *
 * Rendered as an array of Action Rows ready to drop into a Discord
 * interaction response `components` field.
 */
export function agentsComponents(
  bindings: ReadonlyArray<GuildBinding>,
  opts: AgentsComponentOptions,
): DiscordActionRow[] {
  if (bindings.length === 0) {
    return []
  }

  const totalPages = Math.max(1, Math.ceil(bindings.length / SELECT_OPTIONS_MAX))
  const page = clampPage(opts.page ?? 0, totalPages)
  const start = page * SELECT_OPTIONS_MAX
  const slice = bindings.slice(start, start + SELECT_OPTIONS_MAX)

  const selectCustomId = signCustomId({
    action: 'agents_select',
    args: [opts.guildId, opts.userId, String(page)],
    secret: opts.secret,
    now: opts.now,
  })

  const options: DiscordStringSelectOption[] = slice.map((b) => ({
    label: truncate(b.is_primary ? `✓ ${b.assistant_name}` : b.assistant_name, 100),
    value: b.assistant_id,
    description: b.assistant_description ? truncate(b.assistant_description, 100) : undefined,
    default: false,
  }))

  const rows: DiscordActionRow[] = [
    {
      type: COMPONENT_TYPE.ACTION_ROW,
      components: [
        {
          type: COMPONENT_TYPE.STRING_SELECT,
          custom_id: selectCustomId,
          placeholder: 'Choose the active agent for this server',
          min_values: 1,
          max_values: 1,
          options,
        },
      ],
    },
  ]

  if (totalPages > 1) {
    const navButtons: DiscordButton[] = []
    if (page > 0) {
      navButtons.push({
        type: COMPONENT_TYPE.BUTTON,
        style: BUTTON_STYLE.SECONDARY,
        label: '◀ Prev',
        custom_id: signCustomId({
          action: 'agents_page',
          args: [opts.guildId, opts.userId, String(page - 1)],
          secret: opts.secret,
          now: opts.now,
        }),
      })
    }
    navButtons.push({
      type: COMPONENT_TYPE.BUTTON,
      style: BUTTON_STYLE.SECONDARY,
      label: `${page + 1}/${totalPages}`,
      custom_id: signCustomId({
        action: 'agents_page',
        args: [opts.guildId, opts.userId, String(page)],
        secret: opts.secret,
        now: opts.now,
      }),
      disabled: true,
    })
    if (page < totalPages - 1) {
      navButtons.push({
        type: COMPONENT_TYPE.BUTTON,
        style: BUTTON_STYLE.SECONDARY,
        label: 'Next ▶',
        custom_id: signCustomId({
          action: 'agents_page',
          args: [opts.guildId, opts.userId, String(page + 1)],
          secret: opts.secret,
          now: opts.now,
        }),
      })
    }
    rows.push({ type: COMPONENT_TYPE.ACTION_ROW, components: navButtons })
  }

  return rows
}

export interface LeaveConfirmOptions {
  guildId: string
  userId: string
  assistantId: string
  secret?: string
  now?: number
}

/**
 * Build the confirm/cancel button pair for `/leave`. Binds the
 * custom_id to `(guildId, assistantId)` so a stale confirm can't
 * unbind a different agent.
 */
export function leaveConfirmComponents(opts: LeaveConfirmOptions): DiscordActionRow[] {
  return [
    {
      type: COMPONENT_TYPE.ACTION_ROW,
      components: [
        {
          type: COMPONENT_TYPE.BUTTON,
          style: BUTTON_STYLE.DANGER,
          label: 'Unbind agent',
          custom_id: signCustomId({
            action: 'leave_confirm',
            args: [opts.guildId, opts.userId, opts.assistantId],
            secret: opts.secret,
            now: opts.now,
          }),
        },
        {
          type: COMPONENT_TYPE.BUTTON,
          style: BUTTON_STYLE.SECONDARY,
          label: 'Cancel',
          custom_id: signCustomId({
            action: 'leave_cancel',
            args: [opts.guildId, opts.userId],
            secret: opts.secret,
            now: opts.now,
          }),
        },
      ],
    },
  ]
}

export interface ModelsComponentOptions {
  guildId: string
  userId: string
  secret?: string
  now?: number
  page?: number
}

export function modelsComponents(
  models: ReadonlyArray<GuildModelChoice>,
  opts: ModelsComponentOptions,
): DiscordActionRow[] {
  if (models.length === 0) {
    return []
  }

  const totalPages = Math.max(1, Math.ceil(models.length / SELECT_OPTIONS_MAX))
  const page = clampPage(opts.page ?? 0, totalPages)
  const start = page * SELECT_OPTIONS_MAX
  const slice = models.slice(start, start + SELECT_OPTIONS_MAX)

  const selectCustomId = signCustomId({
    action: 'model_select',
    args: [opts.guildId, opts.userId, String(page)],
    secret: opts.secret,
    now: opts.now,
  })

  const options: DiscordStringSelectOption[] = slice.map((model) => ({
    label: truncate(model.is_current ? `[current] ${model.name}` : model.name, 100),
    value: model.id,
    description: truncate(`${model.provider} - ${model.id}`, 100),
    default: Boolean(model.is_current),
  }))

  const rows: DiscordActionRow[] = [
    {
      type: COMPONENT_TYPE.ACTION_ROW,
      components: [
        {
          type: COMPONENT_TYPE.STRING_SELECT,
          custom_id: selectCustomId,
          placeholder: 'Choose the active model for this server',
          min_values: 1,
          max_values: 1,
          options,
        },
      ],
    },
  ]

  if (totalPages > 1) {
    const navButtons: DiscordButton[] = []
    if (page > 0) {
      navButtons.push({
        type: COMPONENT_TYPE.BUTTON,
        style: BUTTON_STYLE.SECONDARY,
        label: '< Prev',
        custom_id: signCustomId({
          action: 'model_page',
          args: [opts.guildId, opts.userId, String(page - 1)],
          secret: opts.secret,
          now: opts.now,
        }),
      })
    }
    navButtons.push({
      type: COMPONENT_TYPE.BUTTON,
      style: BUTTON_STYLE.SECONDARY,
      label: `${page + 1}/${totalPages}`,
      custom_id: signCustomId({
        action: 'model_page',
        args: [opts.guildId, opts.userId, String(page)],
        secret: opts.secret,
        now: opts.now,
      }),
      disabled: true,
    })
    if (page < totalPages - 1) {
      navButtons.push({
        type: COMPONENT_TYPE.BUTTON,
        style: BUTTON_STYLE.SECONDARY,
        label: 'Next >',
        custom_id: signCustomId({
          action: 'model_page',
          args: [opts.guildId, opts.userId, String(page + 1)],
          secret: opts.secret,
          now: opts.now,
        }),
      })
    }
    rows.push({ type: COMPONENT_TYPE.ACTION_ROW, components: navButtons })
  }

  return rows
}

function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) return 0
  if (page < 0) return 0
  if (page >= totalPages) return totalPages - 1
  return Math.floor(page)
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 3) + '...'
}
