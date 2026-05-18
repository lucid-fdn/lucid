#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'

type ChannelType = 'slack' | 'discord' | 'telegram'

interface AssistantChannelRow {
  id: string
  assistant_id: string
  channel_type: ChannelType | string
  external_channel_id: string | null
  is_active: boolean | null
  channel_config: Record<string, unknown> | null
  ai_assistants?: {
    name?: string | null
    org_id?: string | null
  } | Array<{
    name?: string | null
    org_id?: string | null
  }> | null
}

interface ChannelLaunchResponse {
  ok?: boolean
  report?: string
  reportChunks?: string[]
  error?: string
}

interface SmokeResult {
  channel: ChannelType
  command: string
  ok: boolean
  status: number
  chunks: number
  chars: number
  error?: string
}

const args = new Set(process.argv.slice(2))
const target = getArg('--target') ?? 'https://www.lucid.foundation'
const controlPlaneUrl = normalizeUrl(
  getArg('--base-url')
    ?? process.env.LUCID_CONTROL_PLANE_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.APP_URL
    ?? 'https://www.lucid.foundation',
)
const assistantName = getArg('--assistant-name')
const channels = parseChannels(getArg('--channels') ?? 'slack,discord,telegram')
const skipWeb3 = args.has('--skip-web3')
const skipCheck = args.has('--skip-check')
const skipVisible = args.has('--skip-visible')
const requireLive = args.has('--require-live')
const waitRuns = args.has('--wait-runs')
const waitTimeoutMs = Number.parseInt(getArg('--wait-timeout-ms') ?? '300000', 10)

main().catch((error) => {
  console.error('[agent-ops-live-channel-smoke] failed', error instanceof Error ? error.message : String(error))
  process.exit(1)
})

async function main(): Promise<void> {
  const startedAt = new Date().toISOString()
  const secret = process.env.WORKER_TRIGGER_SECRET
  if (!secret) failOrSkip('WORKER_TRIGGER_SECRET is required to call the internal channel launcher.')

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    failOrSkip('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to discover live channel bindings.')
  }

  const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false },
  })
  const bindings = await loadBindings(supabase)
  if (bindings.length === 0) failOrSkip(`No active bindings found for ${channels.join(', ')}.`)

  const smokeId = `live-smoke-${Date.now()}`
  const results: SmokeResult[] = []

  for (const binding of bindings) {
    if (!skipWeb3) {
      results.push(await launchChannelCommand({
        binding,
        rawCommandArg: `web3 ${smokeId} confirm readiness output is not truncated and is not live market data`,
        secret: secret!,
      }))
    }
    if (!skipCheck) {
      results.push(await launchChannelCommand({
        binding,
        rawCommandArg: `check ${target}`,
        secret: secret!,
      }))
    }
  }

  if (!skipVisible) {
    await sendVisibleSmokeMessages(bindings, smokeId)
  }

  const failed = results.filter((result) => !result.ok)
  console.info('[agent-ops-live-channel-smoke] channel launch summary', {
    target,
    controlPlaneUrl,
    assistantName: assistantName ?? 'any active assistant',
    results,
  })

  if (waitRuns && !skipCheck) {
    await waitForCheckRuns({
      supabase,
      startedAt,
      expectedChannels: bindings.map((binding) => binding.channel_type as ChannelType),
      timeoutMs: Number.isFinite(waitTimeoutMs) ? waitTimeoutMs : 300_000,
    })
  }

  if (failed.length > 0) {
    throw new Error(`${failed.length} channel launch smoke request(s) failed.`)
  }
}

async function loadBindings(supabase: ReturnType<typeof createClient>): Promise<AssistantChannelRow[]> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, channel_type, external_channel_id, is_active, channel_config, ai_assistants(name, org_id)')
    .in('channel_type', channels)
    .eq('is_active', true)

  if (error) throw new Error(`Failed to load assistant channel bindings: ${error.message}`)

  const rows = (data ?? []) as AssistantChannelRow[]
  return channels.flatMap((channel) => {
    const candidates = rows
      .filter((row) => row.channel_type === channel)
      .filter((row) => !assistantName || readAssistantName(row).toLowerCase().includes(assistantName.toLowerCase()))
      .filter((row) => readSurfaceId(row).length > 0)
      .sort((a, b) => visibleSmokeScore(b) - visibleSmokeScore(a))

    return candidates.slice(0, 1)
  })
}

function visibleSmokeScore(row: AssistantChannelRow): number {
  if (row.channel_type === 'discord' && readStringArray(row.channel_config?.discord_dedicated_channel_ids).length > 0) {
    return 2
  }
  if (row.channel_type === 'telegram' && readString(row.channel_config?.telegram_chat_id)) {
    return 2
  }
  return 1
}

async function launchChannelCommand(input: {
  binding: AssistantChannelRow
  rawCommandArg: string
  secret: string
}): Promise<SmokeResult> {
  const channel = input.binding.channel_type as ChannelType
  const body = JSON.stringify({
    channelType: channel,
    channelLabel: channelLabel(channel),
    surfaceId: readSurfaceId(input.binding),
    externalUserId: `agent-ops-live-smoke:${channel}`,
    rawCommandArg: input.rawCommandArg,
    binding: {
      assistant_id: input.binding.assistant_id,
      org_id: readAssistantOrgId(input.binding),
      assistant_name: readAssistantName(input.binding),
    },
  })

  try {
    const response = await fetch(`${controlPlaneUrl}/api/internal/agent-ops/channel-launch`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.secret}`,
      },
      body,
    })
    const text = await response.text()
    const payload = parseJson<ChannelLaunchResponse>(text)
    const chunks = Array.isArray(payload?.reportChunks)
      ? payload.reportChunks.filter((chunk) => typeof chunk === 'string' && chunk.trim().length > 0)
      : payload?.report
        ? [payload.report]
        : []
    const report = chunks.join('\n')
    const isWeb3 = input.rawCommandArg.trim().toLowerCase().startsWith('web3')
    const web3BoundaryOk = !isWeb3 || (report.includes('not live market data') && !report.includes('…'))
    return {
      channel,
      command: input.rawCommandArg.split(/\s+/)[0] ?? input.rawCommandArg,
      ok: response.ok && payload?.ok === true && chunks.length > 0 && web3BoundaryOk,
      status: response.status,
      chunks: chunks.length,
      chars: report.length,
      error: response.ok
        ? payload?.error ?? (web3BoundaryOk ? undefined : 'Web3 report boundary check failed')
        : payload?.error ?? truncate(text, 400),
    }
  } catch (error) {
    return {
      channel,
      command: input.rawCommandArg.split(/\s+/)[0] ?? input.rawCommandArg,
      ok: false,
      status: 0,
      chunks: 0,
      chars: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function sendVisibleSmokeMessages(bindings: AssistantChannelRow[], smokeId: string): Promise<void> {
  const message = `Lucid live channel smoke ${smokeId}: control-plane launch checks completed.`

  await Promise.all(bindings.map(async (binding) => {
    const channel = binding.channel_type as ChannelType
    try {
      if (channel === 'telegram') {
        const token = process.env.TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_HOSTED_BOT_TOKEN
        const chatId = process.env.LIVE_SMOKE_TELEGRAM_CHAT_ID ?? readSurfaceId(binding)
        if (!token || !chatId) return
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: message }),
        })
        console.info('[agent-ops-live-channel-smoke] telegram visible send', { ok: response.ok, status: response.status })
      }

      if (channel === 'discord') {
        const token = process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_HOSTED_BOT_TOKEN
        const channelId = process.env.LIVE_SMOKE_DISCORD_CHANNEL_ID ?? readDiscordVisibleChannelId(binding)
        if (!token || !channelId) return
        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            authorization: `Bot ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ content: message }),
        })
        console.info('[agent-ops-live-channel-smoke] discord visible send', { ok: response.ok, status: response.status })
      }

      if (channel === 'slack') {
        const webhookUrl = process.env.SLACK_WEBHOOK_URL
        if (!webhookUrl) return
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: message }),
        })
        console.info('[agent-ops-live-channel-smoke] slack visible send', { ok: response.ok, status: response.status })
      }
    } catch (error) {
      console.warn('[agent-ops-live-channel-smoke] visible send failed', {
        channel,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }))
}

async function waitForCheckRuns(input: {
  supabase: ReturnType<typeof createClient>
  startedAt: string
  expectedChannels: ChannelType[]
  timeoutMs: number
}): Promise<void> {
  const deadline = Date.now() + input.timeoutMs
  const completed = new Set<ChannelType>()
  while (Date.now() < deadline) {
    const { data, error } = await input.supabase
      .from('agent_ops_runs')
      .select('id, status, workflow_id, created_at, completed_at, metadata')
      .eq('workflow_id', 'check-page')
      .gte('created_at', input.startedAt)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw new Error(`Failed to inspect Agent Ops check runs: ${error.message}`)

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const metadata = readRecord(row.metadata)
      const channel = readRecord(metadata.channel).type
      if (!isChannelType(channel)) continue
      if (!input.expectedChannels.includes(channel)) continue
      if (row.status === 'completed') completed.add(channel)
    }

    if (completed.size >= input.expectedChannels.length) {
      console.info('[agent-ops-live-channel-smoke] check runs completed', {
        completed: Array.from(completed).sort(),
      })
      return
    }

    await sleep(5_000)
  }

  throw new Error(
    `Timed out waiting for check-page runs to complete for ${input.expectedChannels
      .filter((channel) => !completed.has(channel))
      .join(', ')}`,
  )
}

function readSurfaceId(row: AssistantChannelRow): string {
  const config = row.channel_config ?? {}
  const dedicatedDiscord = readStringArray(config.discord_dedicated_channel_ids)[0]
  const slackTeamId = readString(config.slack_team_id)
  const telegramChatId = readString(config.telegram_chat_id)
  return row.external_channel_id
    ?? dedicatedDiscord
    ?? telegramChatId
    ?? slackTeamId
    ?? ''
}

function readDiscordVisibleChannelId(row: AssistantChannelRow): string {
  const config = row.channel_config ?? {}
  return readStringArray(config.discord_dedicated_channel_ids)[0]
    ?? row.external_channel_id
    ?? ''
}

function readAssistantName(row: AssistantChannelRow): string {
  const assistant = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
  return assistant?.name ?? 'Lucid'
}

function readAssistantOrgId(row: AssistantChannelRow): string | null {
  const assistant = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
  return assistant?.org_id ?? null
}

function channelLabel(channel: ChannelType): string {
  if (channel === 'slack') return 'Slack'
  if (channel === 'discord') return 'Discord'
  return 'Telegram'
}

function parseChannels(value: string): ChannelType[] {
  const parsed = value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(isChannelType)
  return parsed.length > 0 ? Array.from(new Set(parsed)) : ['slack', 'discord', 'telegram']
}

function isChannelType(value: unknown): value is ChannelType {
  return value === 'slack' || value === 'discord' || value === 'telegram'
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function parseJson<T>(value: string): T | null {
  try {
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

function getArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  const value = process.argv[index + 1]
  return value && !value.startsWith('--') ? value : null
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function failOrSkip(message: string): never {
  if (requireLive) {
    throw new Error(message)
  }
  console.warn(`[agent-ops-live-channel-smoke] skipped: ${message}`)
  process.exit(0)
}
