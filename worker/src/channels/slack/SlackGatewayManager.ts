import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import type { CanonicalAttachment } from '../../core/contracts/index.js'
import {
  mapSlackFilesToAttachments,
  type SlackInboundFileLike,
} from '../bridge/slack/inbound-media.js'
import {
  bindHostedSlackInstallToConversation,
  getHostedSlackBindingForConversation,
  getHostedSlackActivitySnapshot,
  getHostedSlackInstallById,
  listBoundHostedSlackBindings,
  listUnboundHostedSlackInstalls,
  type SlackHostedAssistantBinding,
  unbindHostedSlackConversation,
  unbindHostedSlackInstallById,
} from './bindings.js'
import {
  buildSlackAppHomeView,
  buildSlackChooseAgentForConversationModal,
  buildSlackChooseChannelModal,
} from './app-home.js'
import { buildSlackInboundEnvelope } from '../../core/transports/slack-envelope.js'
import { decryptChannelSecrets } from '../../crypto/decrypt-channel-secrets.js'
import { getTracer, SpanStatusCode } from '../../observability/tracing.js'
import { resolveAgentTarget } from '../shared-agent-routing.js'
import { launchSlackAgentOpsMessagesFromControlPlane } from './agent-ops-control-plane.js'

export interface InboundRoutingConfig {
  dedicated_channel?: boolean
  prefix?: string | null
  respond_on_mention?: boolean
  thread_support?: boolean
  ignore_bots?: boolean
}

export const DEFAULT_SLACK_ROUTING_CONFIG: InboundRoutingConfig = {
  respond_on_mention: true,
  ignore_bots: true,
}

interface ChannelMapping {
  internalChannelId: string
  assistantId: string
  orgId: string | null
  externalChannelId: string | null
  workspaceWideEnabled: boolean
  routingConfig: InboundRoutingConfig
  ackReaction: string | null
  typingReaction: string | null
  allowedUserIds: string[]
  threadHistoryScope: 'thread' | 'channel'
  threadInheritParent: boolean
  threadInitialHistoryLimit: number | null
}

interface SlackGatewayChannelRow {
  id: string
  assistant_id: string
  assistant?: { org_id?: string | null } | null
  channel_type: string
  external_channel_id?: string | null
  inbound_routing_config?: InboundRoutingConfig | Record<string, unknown> | null
  channel_config?: Record<string, unknown> | null
  connection_mode?: string | null
  is_active?: boolean | null
  encrypted_secrets?: { encrypted_data?: string } | null
}

interface SlackInboundMessage {
  user: string
  text?: string
  channel: string
  ts: string
  thread_ts?: string
  bot_id?: string
  _isMention?: boolean
  files?: SlackInboundFileLike[]
}

interface ManagedClient {
  tokenHash: string
  botToken: string
  appToken: string
  botUserId: string | null
  botName: string | null
  teamId: string | null
  connected: boolean
  lastStartAt: string | null
  lastError: string | null
  channels: Map<string, ChannelMapping>
  postMessage: (params: {
    channel: string
    text: string
    threadTs?: string
    blocks?: Record<string, unknown>[]
  }) => Promise<void>
  postEphemeral: (params: {
    channel: string
    user: string
    text: string
    blocks?: Record<string, unknown>[]
  }) => Promise<void>
  react: (params: {
    channel: string
    timestamp: string
    name: string
  }) => Promise<void>
  unreact: (params: {
    channel: string
    timestamp: string
    name: string
  }) => Promise<void>
  openModal: (params: {
    triggerId: string
    view: Record<string, unknown>
  }) => Promise<void>
  publishHome: (params: {
    userId: string
    view: Record<string, unknown>
  }) => Promise<void>
  openDm: (params: { userId: string }) => Promise<string | null>
  getConversationMeta: (params: {
    channelId: string
  }) => Promise<{ label: string | null; type: 'public' | 'private' | 'mpim' | 'im' | null }>
  destroy: () => Promise<void>
}

const MAX_CLIENTS = 50
const SLACK_ACK_REACTION = 'eyes'
const SLACK_PROCESSING_REACTION = 'hourglass_flowing_sand'
type SlackRespond = ((message: unknown) => Promise<unknown>) | undefined

interface SlackProbeResult {
  ok: boolean
  status: number | null
  error: string | null
  elapsedMs: number
  bot?: {
    id?: string | null
    name?: string | null
  }
  team?: {
    id?: string | null
    name?: string | null
  }
}

function isDuplicateInboundInsertError(error: unknown): error is { code: string } {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code === '23505'
  )
}

const SLACK_AGENT_OPS_COMMAND_TOKENS = new Set([
  'ops',
  'agentops',
  'qa',
  'check',
  'check-page',
  'test',
  'test-funnel',
  'buy',
  'buy-stuff',
  'purchase',
  'shop',
  'groceries',
  'research',
  'research-site',
  'research-website',
  'plan',
  'search',
  'remember',
  'claims',
  'extract',
  'extract-data',
  'scrape',
  'monitor',
  'monitor-page',
  'watch',
  'portal',
  'update-portal',
  'operate',
  'repro',
  'reproduce',
  'support-repro',
])

const SLACK_AGENT_OPS_MENU_ACTION_ID = 'lucid_agent_ops_menu_launch'
const SLACK_AGENT_OPS_MODAL_CALLBACK_ID = 'lucid_agent_ops_launch_modal'
const SLACK_AGENT_OPS_TARGET_BLOCK_ID = 'agent_ops_target'
const SLACK_AGENT_OPS_TARGET_ACTION_ID = 'target'
const SLACK_AGENT_OPS_NOTES_BLOCK_ID = 'agent_ops_notes'
const SLACK_AGENT_OPS_NOTES_ACTION_ID = 'notes'

type SlackAgentOpsMenuWorkflow = {
  label: string
  description: string
  workflowToken: string
  placeholder: string
  helpText: string
}

const SLACK_AGENT_OPS_MENU_WORKFLOWS: SlackAgentOpsMenuWorkflow[] = [
  {
    label: 'Check page',
    description: 'Browser Operator smoke check with screenshots, console, network, and perf evidence.',
    workflowToken: 'check',
    placeholder: 'https://www.example.com',
    helpText: 'Use this for a fast browser health check of a live page.',
  },
  {
    label: 'Buy stuff',
    description: 'Prepare a governed purchase with cart, policy, approval, and receipt evidence.',
    workflowToken: 'buy',
    placeholder: 'weekly groceries under $120 from Carrefour',
    helpText: 'Use this for safe shopping preparation. Checkout stays approval-gated and fail-closed.',
  },
  {
    label: 'Research site',
    description: 'Research a website or competitor page.',
    workflowToken: 'research',
    placeholder: 'https://competitor.example.com',
    helpText: 'Use this when you want a site summary, positioning notes, and evidence.',
  },
  {
    label: 'Extract data',
    description: 'Extract structured information from a page.',
    workflowToken: 'extract',
    placeholder: 'pricing from https://www.example.com/pricing',
    helpText: 'Describe what to extract and include the source URL.',
  },
  {
    label: 'Monitor page',
    description: 'Start a page-monitoring Agent Ops run.',
    workflowToken: 'monitor',
    placeholder: 'https://status.example.com',
    helpText: 'Use this to watch a page or status surface for changes.',
  },
  {
    label: 'QA URL',
    description: 'Run the broader Agent Ops QA workflow for a URL.',
    workflowToken: 'qa',
    placeholder: 'https://preview.example.com',
    helpText: 'Use this before shipping a web change.',
  },
]

function normalizeSlackAgentOpsCommandArg(text: string | undefined): string | null {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return null

  const [action, ...rest] = trimmed.split(/\s+/).filter(Boolean)
  const normalizedAction = action?.toLowerCase()
  if (!normalizedAction || !SLACK_AGENT_OPS_COMMAND_TOKENS.has(normalizedAction)) return null
  if (normalizedAction === 'ops' || normalizedAction === 'agentops') {
    return rest.join(' ').trim()
  }
  if (normalizedAction === 'claims') return trimmed
  return rest.length > 0 ? trimmed : null
}

function getSlackAgentOpsMenuWorkflow(
  workflowToken: string | null | undefined,
): SlackAgentOpsMenuWorkflow | null {
  const normalized = workflowToken?.trim().toLowerCase()
  if (!normalized) return null
  return SLACK_AGENT_OPS_MENU_WORKFLOWS.find((workflow) => workflow.workflowToken === normalized) ?? null
}

function readSlackPlainTextInput(
  values: unknown,
  blockId: string,
  actionId: string,
): string {
  if (!values || typeof values !== 'object') return ''
  const block = (values as Record<string, unknown>)[blockId]
  if (!block || typeof block !== 'object') return ''
  const action = (block as Record<string, unknown>)[actionId]
  if (!action || typeof action !== 'object') return ''
  const value = (action as { value?: unknown }).value
  return typeof value === 'string' ? value.trim() : ''
}

function composeSlackAgentOpsRawCommandArg(input: {
  workflowToken: string
  target: string
  notes?: string
}): string {
  const target = input.target.trim()
  const notes = input.notes?.trim()
  return [input.workflowToken, target, notes ? `- ${notes}` : null]
    .filter(Boolean)
    .join(' ')
}

export function validateSlackAgentOpsModalTarget(input: {
  workflowToken: string
  target: string
}): string | null {
  const target = input.target.trim()
  if (!target) return 'Add the target for this workflow.'
  if (input.workflowToken === 'extract') {
    return /https?:\/\/\S+/i.test(target)
      ? null
      : 'Include the source URL, for example: pricing from https://example.com/pricing'
  }
  if (input.workflowToken === 'buy') {
    return target.length >= 8
      ? null
      : 'Describe what to buy, for example: weekly groceries under $120 from Carrefour'
  }
  return /^https?:\/\/\S+/i.test(target)
    ? null
    : 'Enter a full URL starting with http:// or https://.'
}

export function buildSlackLucidSlashAck(
  text: string | undefined,
): { response_type: 'ephemeral'; text: string } | null {
  if (normalizeSlackAgentOpsCommandArg(text) == null) return null
  return {
    response_type: 'ephemeral',
    text: 'Starting Agent Ops...',
  }
}

export function buildSlackAgentOpsMenuBlocks(): Record<string, unknown>[] {
  const workflowButtons = SLACK_AGENT_OPS_MENU_WORKFLOWS.map((workflow) => ({
    type: 'button',
    text: {
      type: 'plain_text',
      text: workflow.label,
      emoji: true,
    },
    action_id: SLACK_AGENT_OPS_MENU_ACTION_ID,
    value: workflow.workflowToken,
  }))

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Launch Agent Ops',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Choose a workflow, or type a command directly. These runs appear in Mission Control with Browser Operator evidence, findings, runtime state, and channel status.',
      },
    },
    {
      type: 'actions',
      elements: workflowButtons.slice(0, 5),
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          '*Examples*',
          '`/lucid check https://www.lucid.foundation`',
          '`/lucid buy weekly groceries under $120 from Carrefour`',
          '`/lucid research https://competitor.example.com`',
          '`/lucid plan release readiness for tomorrow`',
          '`/lucid search launch blockers`',
          '`/lucid remember Finance approval is required for paid vendor tests`',
          '`/lucid claims pricing risk`',
          '`/lucid extract pricing from https://example.com/pricing`',
          '`/lucid monitor https://status.example.com`',
          '`/lucid ops qa https://preview.example.com`',
        ].join('\n'),
      },
    },
  ]
}

export function buildSlackAgentOpsLaunchModal(input: {
  workflowToken: string
  channelId: string
  userId: string
}): Record<string, unknown> {
  const workflow = getSlackAgentOpsMenuWorkflow(input.workflowToken)
  const label = workflow?.label ?? 'Agent Ops'
  return {
    type: 'modal',
    callback_id: SLACK_AGENT_OPS_MODAL_CALLBACK_ID,
    private_metadata: JSON.stringify({
      workflowToken: input.workflowToken,
      channelId: input.channelId,
      userId: input.userId,
    }),
    title: {
      type: 'plain_text',
      text: label.slice(0, 24),
      emoji: true,
    },
    submit: {
      type: 'plain_text',
      text: 'Launch',
      emoji: true,
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
      emoji: true,
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${label}*\n${workflow?.description ?? 'Launch an Agent Ops workflow from Slack.'}`,
        },
      },
      {
        type: 'input',
        block_id: SLACK_AGENT_OPS_TARGET_BLOCK_ID,
        label: {
          type: 'plain_text',
          text: input.workflowToken === 'extract'
            ? 'Task and URL'
            : input.workflowToken === 'buy'
              ? 'Purchase request'
              : 'Target URL',
          emoji: true,
        },
        hint: {
          type: 'plain_text',
          text: workflow?.helpText ?? 'Add the target for this workflow.',
        },
        element: {
          type: 'plain_text_input',
          action_id: SLACK_AGENT_OPS_TARGET_ACTION_ID,
          placeholder: {
            type: 'plain_text',
            text: (workflow?.placeholder ?? 'https://www.example.com').slice(0, 150),
          },
        },
      },
      {
        type: 'input',
        block_id: SLACK_AGENT_OPS_NOTES_BLOCK_ID,
        optional: true,
        label: {
          type: 'plain_text',
          text: 'Notes',
          emoji: true,
        },
        element: {
          type: 'plain_text_input',
          action_id: SLACK_AGENT_OPS_NOTES_ACTION_ID,
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'Optional context for Lucid',
          },
        },
      },
    ],
  }
}

export function normalizeSlackInboundRoutingConfig(
  config: InboundRoutingConfig | Record<string, unknown> | null | undefined,
): InboundRoutingConfig {
  return {
    ...DEFAULT_SLACK_ROUTING_CONFIG,
    ...(config && typeof config === 'object' ? config : {}),
  }
}

function resolveSlackProcessingReaction(
  channelConfig: Record<string, unknown> | null | undefined,
): string | null {
  if (!channelConfig || typeof channelConfig !== 'object') {
    return SLACK_PROCESSING_REACTION
  }
  if (!Object.prototype.hasOwnProperty.call(channelConfig, 'slack_typing_reaction')) {
    return SLACK_PROCESSING_REACTION
  }
  const rawValue = channelConfig.slack_typing_reaction
  if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    return rawValue.trim()
  }
  return null
}

function resolveSlackAckReaction(
  channelConfig: Record<string, unknown> | null | undefined,
): string | null {
  if (!channelConfig || typeof channelConfig !== 'object') {
    return SLACK_ACK_REACTION
  }
  if (!Object.prototype.hasOwnProperty.call(channelConfig, 'slack_ack_reaction')) {
    return SLACK_ACK_REACTION
  }
  const rawValue = channelConfig.slack_ack_reaction
  if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    return rawValue.trim()
  }
  return null
}

function resolveSlackAllowedUserIds(
  channelConfig: Record<string, unknown> | null | undefined,
): string[] {
  if (!channelConfig || typeof channelConfig !== 'object') return []
  const rawValue = channelConfig.slack_allowed_user_ids
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index)
}

function resolveSlackThreadHistoryScope(
  channelConfig: Record<string, unknown> | null | undefined,
): 'thread' | 'channel' {
  if (!channelConfig || typeof channelConfig !== 'object') return 'thread'
  return channelConfig.slack_thread_history_scope === 'channel' ? 'channel' : 'thread'
}

function resolveSlackThreadInheritParent(
  channelConfig: Record<string, unknown> | null | undefined,
): boolean {
  if (!channelConfig || typeof channelConfig !== 'object') return false
  return channelConfig.slack_thread_inherit_parent === true
}

function resolveSlackThreadInitialHistoryLimit(
  channelConfig: Record<string, unknown> | null | undefined,
): number | null {
  if (!channelConfig || typeof channelConfig !== 'object') return null
  const rawValue = channelConfig.slack_thread_initial_history_limit
  if (typeof rawValue !== 'number' || !Number.isInteger(rawValue) || rawValue < 0) {
    return null
  }
  return rawValue
}

function resolveSlackWorkspaceWideEnabled(
  channelConfig: Record<string, unknown> | null | undefined,
): boolean {
  if (!channelConfig || typeof channelConfig !== 'object') return false
  return channelConfig.slack_workspace_wide_enabled === true
}

function buildSlackExternalChatId(
  channelId: string,
  threadTs: string | undefined,
  config: InboundRoutingConfig,
): string {
  if (config.thread_support === true && typeof threadTs === 'string' && threadTs.trim().length > 0) {
    return `${channelId}:thread:${threadTs.trim()}`
  }
  return channelId
}

export function buildSlackInboundMessageData(params: {
  rawPayload: Record<string, unknown>
  attachments: ReturnType<typeof mapSlackFilesToAttachments>
  threadTs?: string
  source?: 'message' | 'slash_command' | 'system_event'
}): Record<string, unknown> {
  return {
    channel_type: 'slack',
    ...(params.threadTs ? { thread_ts: params.threadTs } : {}),
    ...(params.source ? { source: params.source } : {}),
    attachments: params.attachments,
    slack_files: params.attachments,
    slack_raw_payload: params.rawPayload,
  }
}

interface SlackSystemEventPayload {
  channelId: string
  actorUserId: string | null
  eventType:
    | 'reaction_added'
    | 'reaction_removed'
    | 'pin_added'
    | 'pin_removed'
    | 'member_joined_channel'
    | 'member_left_channel'
    | 'channel_rename'
    | 'message_changed'
    | 'message_deleted'
    | 'thread_broadcast'
  text: string
  rawPayload: Record<string, unknown>
  externalMessageId: string
}

export function isSlackUserMessageEvent(
  message: unknown,
): message is SlackInboundMessage & { user: string } {
  if (!message || typeof message !== 'object') return false
  if (!('user' in message)) return false
  if ('subtype' in message && (message as { subtype?: unknown }).subtype != null) {
    return false
  }
  return true
}

function shouldBootstrapHostedSlackClient(
  row: Pick<SlackGatewayChannelRow, 'channel_config' | 'connection_mode' | 'is_active'>,
): boolean {
  if (row.connection_mode !== 'hosted') return false
  if (row.is_active === true) return true

  const config =
    row.channel_config && typeof row.channel_config === 'object' ? row.channel_config : {}
  const installStatus =
    typeof config.install_status === 'string' ? config.install_status.trim() : null

  return (
    config.hosted === true &&
    (installStatus === 'installed_unbound' ||
      installStatus === 'bound' ||
      installStatus === 'unbound')
  )
}

function mapSlackAttachmentsToCanonical(
  attachments: ReturnType<typeof mapSlackFilesToAttachments>,
): CanonicalAttachment[] {
  return attachments.map((attachment) => ({
    kind: attachment.kind,
    id: attachment.file_id ?? null,
    fileName: attachment.file_name ?? null,
    url: attachment.url_private ?? null,
    mimeType: attachment.mime_type ?? null,
  }))
}

export class SlackGatewayManager {
  private clients: Map<string, ManagedClient> = new Map()
  private supabase: SupabaseClient
  private encryptionKey: string
  private onInboundQueued?: (event: {
    id: string
    assistant_id: string
    org_id?: string
    external_message_id?: string | null
  }) => Promise<void> | void
  private refreshIntervalId: ReturnType<typeof setInterval> | null = null
  private running = false
  private lastProbeAt: string | null = null
  private lastProbe: SlackProbeResult | null = null
  private lastError: string | null = null
  private lastRefreshAt: string | null = null
  private refreshFailureCount = 0
  private nextRefreshAtMs = 0

  constructor(
    supabase: SupabaseClient,
    encryptionKey: string,
    onInboundQueued?: (event: {
      id: string
      assistant_id: string
      org_id?: string
      external_message_id?: string | null
    }) => Promise<void> | void,
  ) {
    this.supabase = supabase
    this.encryptionKey = encryptionKey
    this.onInboundQueued = onInboundQueued
  }

  private async notifyInboundQueued(event: {
    id: string
    assistant_id: string
    org_id?: string
    external_message_id?: string | null
  }): Promise<void> {
    if (!this.onInboundQueued) return
    try {
      await this.onInboundQueued(event)
    } catch (error) {
      console.error(
        '[slack-gw] Immediate inbound enqueue hook failed:',
        error instanceof Error ? error.message : error,
      )
    }
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    console.log('[slack-gw] Starting Slack Gateway Manager')
    await this.refresh()
    this.refreshIntervalId = setInterval(() => {
      this.refresh().catch((err) =>
        console.error('[slack-gw] Refresh error:', err),
      )
    }, 60_000)
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId)
      this.refreshIntervalId = null
    }
    const stops: Promise<void>[] = []
    for (const [hash, client] of this.clients) {
      console.log(`[slack-gw] Stopping client ${hash.slice(0, 8)}...`)
      stops.push(client.destroy())
    }
    await Promise.allSettled(stops)
    this.clients.clear()
    console.log('[slack-gw] All clients stopped')
  }

  async refresh(): Promise<void> {
    const now = Date.now()
    if (this.nextRefreshAtMs > now) return

    const channelsByToken = await this.loadChannelsGroupedByToken()
    if (!channelsByToken) {
      this.refreshFailureCount += 1
      const backoffMs = Math.min(60_000 * 2 ** (this.refreshFailureCount - 1), 10 * 60_000)
      this.nextRefreshAtMs = now + backoffMs
      this.lastRefreshAt = new Date().toISOString()
      console.warn(
        `[slack-gw] Channel refresh failed; preserving ${this.clients.size} existing clients; next retry in ${Math.round(backoffMs / 1000)}s`,
      )
      return
    }

    this.refreshFailureCount = 0
    this.nextRefreshAtMs = 0
    for (const [tokenHash, client] of this.clients) {
      if (!channelsByToken.has(client.botToken)) {
        console.log(`[slack-gw] Removing stale client ${tokenHash.slice(0, 8)}`)
        await client.destroy()
        this.clients.delete(tokenHash)
      }
    }
    for (const [botToken, { appToken, channels }] of channelsByToken) {
      const tokenHash = this.hashToken(botToken)
      const existing = this.clients.get(tokenHash)
      if (existing) {
        existing.channels = channels
      } else if (this.clients.size >= MAX_CLIENTS) {
        console.warn(
          `[slack-gw] Connection pool limit reached (${MAX_CLIENTS}). Skipping client ${tokenHash.slice(0, 8)}`,
        )
      } else {
        console.log(
          `[slack-gw] Starting new client ${tokenHash.slice(0, 8)} with ${channels.size} channels`,
        )
        await this.createClient(botToken, appToken, tokenHash, channels)
      }
    }
    const totalChannels = Array.from(this.clients.values()).reduce(
      (sum, c) => sum + c.channels.size,
      0,
    )
    this.lastRefreshAt = new Date().toISOString()
    console.log(
      `[slack-gw] Active: ${this.clients.size} clients, ${totalChannels} channels`,
    )
  }

  async probeHostedBot(): Promise<SlackProbeResult | null> {
    const client = Array.from(this.clients.values()).find((entry) => entry.connected)
    if (!client) return null

    const startedAt = Date.now()
    try {
      const response = await fetch('https://slack.com/api/auth.test', {
        headers: {
          Authorization: `Bearer ${client.botToken}`,
        },
      })
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean
            error?: string
            user_id?: string
            user?: string
            team_id?: string
            team?: string
          }
        | null

      const probe: SlackProbeResult = {
        ok: response.ok && payload?.ok === true,
        status: response.status,
        error: response.ok && payload?.ok === true ? null : payload?.error || `HTTP ${response.status}`,
        elapsedMs: Date.now() - startedAt,
        bot: {
          id: payload?.user_id ?? client.botUserId,
          name: payload?.user ?? client.botName,
        },
        team: {
          id: payload?.team_id ?? client.teamId,
          name: payload?.team ?? null,
        },
      }
      this.lastProbeAt = new Date().toISOString()
      this.lastProbe = probe
      this.lastError = probe.ok ? null : probe.error
      return probe
    } catch (error) {
      const probe: SlackProbeResult = {
        ok: false,
        status: null,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startedAt,
        bot: {
          id: client.botUserId,
          name: client.botName,
        },
        team: {
          id: client.teamId,
          name: null,
        },
      }
      this.lastProbeAt = new Date().toISOString()
      this.lastProbe = probe
      this.lastError = probe.error
      return probe
    }
  }

  getAdminStatus(): {
    configured: boolean
    running: boolean
    lastStartAt: string | null
    lastRefreshAt: string | null
    lastProbeAt: string | null
    lastError: string | null
    probe: SlackProbeResult | null
    stats: ReturnType<SlackGatewayManager['getStats']>
  } {
    const clientList = Array.from(this.clients.values())
    const lastStartAt = clientList
      .map((client) => client.lastStartAt)
      .filter((value): value is string => typeof value === 'string')
      .sort()
      .at(-1) ?? null

    return {
      configured: clientList.length > 0,
      running: this.running && clientList.some((client) => client.connected),
      lastStartAt,
      lastRefreshAt: this.lastRefreshAt,
      lastProbeAt: this.lastProbeAt,
      lastError: this.lastError ?? clientList.map((client) => client.lastError).find(Boolean) ?? null,
      probe: this.lastProbe,
      stats: this.getStats(),
    }
  }

  private async loadChannelsGroupedByToken(): Promise<
    Map<string, { appToken: string; channels: Map<string, ChannelMapping> }> | null
  > {
    const { data: channels, error } = await this.supabase
      .from('assistant_channels')
      .select(`
        id,
        assistant_id,
        assistant:ai_assistants!assistant_id (
          org_id
        ),
        channel_type,
        external_channel_id,
        is_active,
        connection_mode,
        channel_config,
        inbound_routing_config,
        encrypted_secrets:encrypted_secrets_id (
          id,
          encrypted_data
        )
      `)
      .eq('channel_type', 'slack')
      .eq('connection_mode', 'hosted')

    if (error || !channels) {
      console.error('[slack-gw] Failed to load channels:', error)
      return null
    }

    const byToken = new Map<string, { appToken: string; channels: Map<string, ChannelMapping> }>()
    for (const ch of channels as SlackGatewayChannelRow[]) {
      const encData = (ch.encrypted_secrets as { encrypted_data?: string } | null)?.encrypted_data
      if (!encData) continue
      if (!shouldBootstrapHostedSlackClient(ch)) continue
      let secrets: Record<string, string>
      try {
        secrets = this.decryptSecrets(encData)
      } catch (err) {
        console.error(
          `[slack-gw] Channel ${ch.id} skipped: decryption failed:`,
          err instanceof Error ? err.message : err,
        )
        continue
      }
      if (!secrets.bot_token || !secrets.app_token) continue
      if (!byToken.has(secrets.bot_token)) {
        byToken.set(secrets.bot_token, {
          appToken: secrets.app_token,
          channels: new Map(),
        })
      }
      const workspaceWideEnabled = resolveSlackWorkspaceWideEnabled(
        ch.channel_config as Record<string, unknown> | null,
      )
      if (typeof ch.external_channel_id === 'string' && ch.external_channel_id.length > 0) {
        byToken.get(secrets.bot_token)!.channels.set(ch.external_channel_id, {
          internalChannelId: ch.id,
          assistantId: ch.assistant_id,
          orgId: typeof ch.assistant?.org_id === 'string' ? ch.assistant.org_id : null,
          externalChannelId: ch.external_channel_id,
          workspaceWideEnabled: false,
          routingConfig: normalizeSlackInboundRoutingConfig(ch.inbound_routing_config as InboundRoutingConfig | null),
          ackReaction: resolveSlackAckReaction(
            ch.channel_config as Record<string, unknown> | null,
          ),
          typingReaction: resolveSlackProcessingReaction(
            ch.channel_config as Record<string, unknown> | null,
          ),
          allowedUserIds: resolveSlackAllowedUserIds(
            ch.channel_config as Record<string, unknown> | null,
          ),
          threadHistoryScope: resolveSlackThreadHistoryScope(
            ch.channel_config as Record<string, unknown> | null,
          ),
          threadInheritParent: resolveSlackThreadInheritParent(
            ch.channel_config as Record<string, unknown> | null,
          ),
          threadInitialHistoryLimit: resolveSlackThreadInitialHistoryLimit(
            ch.channel_config as Record<string, unknown> | null,
          ),
        })
      } else if (workspaceWideEnabled) {
        byToken.get(secrets.bot_token)!.channels.set(`__workspace_wide__:${ch.id}`, {
          internalChannelId: ch.id,
          assistantId: ch.assistant_id,
          orgId: typeof ch.assistant?.org_id === 'string' ? ch.assistant.org_id : null,
          externalChannelId: null,
          workspaceWideEnabled: true,
          routingConfig: normalizeSlackInboundRoutingConfig(ch.inbound_routing_config as InboundRoutingConfig | null),
          ackReaction: resolveSlackAckReaction(
            ch.channel_config as Record<string, unknown> | null,
          ),
          typingReaction: resolveSlackProcessingReaction(
            ch.channel_config as Record<string, unknown> | null,
          ),
          allowedUserIds: resolveSlackAllowedUserIds(
            ch.channel_config as Record<string, unknown> | null,
          ),
          threadHistoryScope: resolveSlackThreadHistoryScope(
            ch.channel_config as Record<string, unknown> | null,
          ),
          threadInheritParent: resolveSlackThreadInheritParent(
            ch.channel_config as Record<string, unknown> | null,
          ),
          threadInitialHistoryLimit: resolveSlackThreadInitialHistoryLimit(
            ch.channel_config as Record<string, unknown> | null,
          ),
        })
      }
    }
    return byToken
  }

  private async createClient(
    botToken: string,
    appToken: string,
    tokenHash: string,
    channels: Map<string, ChannelMapping>,
  ): Promise<void> {
    try {
      const { App, LogLevel } = await import('@slack/bolt')
      const app = new App({
        token: botToken,
        appToken,
        socketMode: true,
        logLevel: LogLevel.ERROR,
      })

      let botUserId: string | null = null
      let botName: string | null = null
      let teamId: string | null = null
      try {
        const authResult = await app.client.auth.test({ token: botToken })
        botUserId = (authResult.user_id as string) ?? null
        botName = (authResult.user as string) ?? null
        teamId = (authResult.team_id as string) ?? null
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err)
        console.error(
          `[slack-gw] Failed to get bot user for ${tokenHash.slice(0, 8)}:`,
          err instanceof Error ? err.message : err,
        )
      }

      const client: ManagedClient = {
        tokenHash,
        botToken,
        appToken,
        botUserId,
        botName,
        teamId,
        connected: false,
        lastStartAt: null,
        lastError: null,
        channels,
        postMessage: async ({ channel, text, threadTs, blocks }) => {
          await app.client.chat.postMessage({
            channel,
            text,
            ...(blocks ? { blocks } : {}),
            ...(threadTs ? { thread_ts: threadTs } : {}),
          })
        },
        postEphemeral: async ({ channel, user, text, blocks }) => {
          await app.client.chat.postEphemeral({
            channel,
            user,
            text,
            ...(blocks ? { blocks } : {}),
          })
        },
        react: async ({ channel, timestamp, name }) => {
          await app.client.reactions.add({ channel, timestamp, name })
        },
        unreact: async ({ channel, timestamp, name }) => {
          await app.client.reactions.remove({ channel, timestamp, name })
        },
        openModal: async ({ triggerId, view }) => {
          await app.client.views.open({
            trigger_id: triggerId,
            view: view as unknown as Parameters<typeof app.client.views.open>[0]['view'],
          })
        },
        publishHome: async ({ userId, view }) => {
          await app.client.views.publish({
            user_id: userId,
            view: view as unknown as Parameters<typeof app.client.views.publish>[0]['view'],
          })
        },
        openDm: async ({ userId }) => {
          const result = await app.client.conversations.open({ users: userId })
          return (result.channel?.id as string | undefined) ?? null
        },
        getConversationMeta: async ({ channelId }) => {
          try {
            const result = await app.client.conversations.info({ channel: channelId })
            const channel = result.channel
            if (!channel) {
              return { label: null, type: null }
            }

            const rawName =
              typeof channel.name === 'string' && channel.name.trim().length > 0
                ? channel.name.trim()
                : null
            const rawUserId =
              typeof (channel as { user?: unknown }).user === 'string'
                ? (channel as { user?: string }).user
                : null
            const userId =
              typeof rawUserId === 'string' && rawUserId.trim().length > 0
                ? rawUserId.trim()
                : null
            const type = channel.is_im
              ? 'im'
              : channel.is_mpim
                ? 'mpim'
                : channel.is_private || channel.is_group
                  ? 'private'
                  : 'public'
            let dmLabel: string | null = null
            if (channel.is_im && userId) {
              try {
                const userResult = await app.client.users.info({ user: userId })
                const user = userResult.user
                const profile =
                  user && typeof user === 'object' && 'profile' in user
                    ? (user.profile as
                        | { display_name?: string; real_name?: string }
                        | undefined)
                    : undefined
                dmLabel =
                  (typeof profile?.display_name === 'string' && profile.display_name.trim().length > 0
                    ? profile.display_name.trim()
                    : null) ||
                  (typeof user?.real_name === 'string' && user.real_name.trim().length > 0
                    ? user.real_name.trim()
                    : null) ||
                  (typeof profile?.real_name === 'string' && profile.real_name.trim().length > 0
                    ? profile.real_name.trim()
                    : null) ||
                  (typeof user?.name === 'string' && user.name.trim().length > 0
                    ? user.name.trim()
                    : null)
              } catch {
                dmLabel = null
              }
            }
            const label = rawName
              ? channel.is_private || channel.is_group
                ? `#${rawName} (private)`
                : `#${rawName}`
              : channel.is_im
                ? dmLabel
                  ? `Direct message with ${dmLabel}`
                  : userId
                    ? `Direct message with @${userId}`
                    : 'Direct message'
                : channel.is_mpim
                  ? 'Group DM'
                  : channelId

            return { label, type }
          } catch {
            return { label: null, type: null }
          }
        },
        destroy: async () => {
          try {
            await app.stop()
          } catch {
            // ignore stop errors
          }
        },
      }

      app.message(async ({ message }) => {
        if (!isSlackUserMessageEvent(message)) return
        const msg = message as SlackInboundMessage
        if (!msg.text && (!Array.isArray(msg.files) || msg.files.length === 0)) return
        await this.handleMessage(msg, client)
      })

      app.event('message', async ({ event }) => {
        const payload = event as {
          subtype?: string
          channel?: string
          user?: string
          hidden?: boolean
          ts?: string
          event_ts?: string
          deleted_ts?: string
          previous_message?: { user?: string; text?: string; ts?: string }
          message?: {
            user?: string
            text?: string
            ts?: string
            thread_ts?: string
          }
        }
        const channelId =
          typeof payload.channel === 'string' && payload.channel.length > 0
            ? payload.channel
            : null
        if (!channelId) return

        if (payload.subtype === 'message_changed' && payload.message) {
          const actorUserId = payload.message.user ?? payload.previous_message?.user ?? null
          if (actorUserId && client.botUserId && actorUserId === client.botUserId) {
            return
          }
          const previousText =
            typeof payload.previous_message?.text === 'string' &&
            payload.previous_message.text.trim().length > 0
              ? payload.previous_message.text.trim()
              : null
          const nextText =
            typeof payload.message.text === 'string' && payload.message.text.trim().length > 0
              ? payload.message.text.trim()
              : null
          await this.handleSystemEvent(
            {
              channelId,
              actorUserId,
              eventType: 'message_changed',
              text: previousText && nextText
                ? `Slack message edited from "${previousText}" to "${nextText}".`
                : 'Slack message edited in this conversation.',
              rawPayload: payload as unknown as Record<string, unknown>,
              externalMessageId: `message_changed:${payload.message.ts || payload.event_ts || Date.now()}`,
            },
            client,
          )
          return
        }

        if (payload.subtype === 'message_deleted') {
          await this.handleSystemEvent(
            {
              channelId,
              actorUserId: payload.previous_message?.user ?? payload.user ?? null,
              eventType: 'message_deleted',
              text: 'Slack message deleted in this conversation.',
              rawPayload: payload as unknown as Record<string, unknown>,
              externalMessageId: `message_deleted:${payload.deleted_ts || payload.event_ts || Date.now()}`,
            },
            client,
          )
          return
        }

        if (payload.subtype === 'thread_broadcast' && payload.message) {
          await this.handleSystemEvent(
            {
              channelId,
              actorUserId: payload.message.user ?? payload.user ?? null,
              eventType: 'thread_broadcast',
              text: 'Slack thread reply broadcast into the parent channel.',
              rawPayload: payload as unknown as Record<string, unknown>,
              externalMessageId: `thread_broadcast:${payload.message.ts || payload.event_ts || Date.now()}`,
            },
            client,
          )
        }
      })

      app.event('app_mention', async ({ event }) => {
        const msg = event as {
          user: string
          text: string
          channel: string
          ts: string
          thread_ts?: string
        }
        await this.handleMessage(
          { ...msg, _isMention: true } as unknown as SlackInboundMessage,
          client,
        )
      })

      app.event('app_home_opened', async ({ event }) => {
        const userId = (event as { user?: string }).user
        if (!userId) return
        await this.publishAppHome(client, userId)
      })

      app.event('reaction_added', async ({ event }) => {
        const payload = event as {
          user?: string
          reaction?: string
          item?: { channel?: string; ts?: string }
          event_ts?: string
        }
        const channelId = payload.item?.channel
        if (!channelId) return
        await this.handleSystemEvent(
          {
            channelId,
            actorUserId: payload.user ?? null,
            eventType: 'reaction_added',
            text: `Slack reaction added${payload.reaction ? `: :${payload.reaction}:` : ''}.`,
            rawPayload: payload as unknown as Record<string, unknown>,
            externalMessageId: `reaction_added:${payload.event_ts || payload.item?.ts || Date.now()}`,
          },
          client,
        )
      })

      app.event('reaction_removed', async ({ event }) => {
        const payload = event as {
          user?: string
          reaction?: string
          item?: { channel?: string; ts?: string }
          event_ts?: string
        }
        const channelId = payload.item?.channel
        if (!channelId) return
        await this.handleSystemEvent(
          {
            channelId,
            actorUserId: payload.user ?? null,
            eventType: 'reaction_removed',
            text: `Slack reaction removed${payload.reaction ? `: :${payload.reaction}:` : ''}.`,
            rawPayload: payload as unknown as Record<string, unknown>,
            externalMessageId: `reaction_removed:${payload.event_ts || payload.item?.ts || Date.now()}`,
          },
          client,
        )
      })

      app.event('pin_added', async ({ event }) => {
        const payload = event as {
          user?: string
          channel_id?: string
          item?: { channel?: string; message?: { ts?: string } }
          event_ts?: string
        }
        const channelId = payload.channel_id || payload.item?.channel
        if (!channelId) return
        await this.handleSystemEvent(
          {
            channelId,
            actorUserId: payload.user ?? null,
            eventType: 'pin_added',
            text: 'Slack message pinned in this conversation.',
            rawPayload: payload as unknown as Record<string, unknown>,
            externalMessageId: `pin_added:${payload.event_ts || payload.item?.message?.ts || Date.now()}`,
          },
          client,
        )
      })

      app.event('pin_removed', async ({ event }) => {
        const payload = event as {
          user?: string
          channel_id?: string
          item?: { channel?: string; message?: { ts?: string } }
          event_ts?: string
        }
        const channelId = payload.channel_id || payload.item?.channel
        if (!channelId) return
        await this.handleSystemEvent(
          {
            channelId,
            actorUserId: payload.user ?? null,
            eventType: 'pin_removed',
            text: 'Slack message unpinned in this conversation.',
            rawPayload: payload as unknown as Record<string, unknown>,
            externalMessageId: `pin_removed:${payload.event_ts || payload.item?.message?.ts || Date.now()}`,
          },
          client,
        )
      })

      app.event('member_joined_channel', async ({ event }) => {
        const payload = event as { user?: string; channel?: string; event_ts?: string }
        if (!payload.channel) return
        await this.handleSystemEvent(
          {
            channelId: payload.channel,
            actorUserId: payload.user ?? null,
            eventType: 'member_joined_channel',
            text: `Slack member joined this conversation${payload.user ? `: <@${payload.user}>` : ''}.`,
            rawPayload: payload as unknown as Record<string, unknown>,
            externalMessageId: `member_joined_channel:${payload.event_ts || Date.now()}`,
          },
          client,
        )
      })

      app.event('member_left_channel', async ({ event }) => {
        const payload = event as { user?: string; channel?: string; event_ts?: string }
        if (!payload.channel) return
        await this.handleSystemEvent(
          {
            channelId: payload.channel,
            actorUserId: payload.user ?? null,
            eventType: 'member_left_channel',
            text: `Slack member left this conversation${payload.user ? `: <@${payload.user}>` : ''}.`,
            rawPayload: payload as unknown as Record<string, unknown>,
            externalMessageId: `member_left_channel:${payload.event_ts || Date.now()}`,
          },
          client,
        )
      })

      app.event('channel_rename', async ({ event }) => {
        const payload = event as { channel?: { id?: string; name?: string }; event_ts?: string }
        const channelId = payload.channel?.id
        if (!channelId) return
        await this.handleSystemEvent(
          {
            channelId,
            actorUserId: null,
            eventType: 'channel_rename',
            text: `Slack channel renamed${payload.channel?.name ? ` to #${payload.channel.name}` : ''}.`,
            rawPayload: payload as unknown as Record<string, unknown>,
            externalMessageId: `channel_rename:${payload.event_ts || Date.now()}`,
          },
          client,
        )
      })

      app.command('/lucid', async ({ command, ack, respond }) => {
        const immediateAck = buildSlackLucidSlashAck(command.text)
        if (immediateAck) {
          await ack(immediateAck)
        } else {
          await ack()
        }

        const handled = await this.handleLucidSlashCommand(
          {
            text: command.text,
            channelId: command.channel_id,
            userId: command.user_id,
            triggerId: command.trigger_id,
          },
          client,
          respond as SlackRespond,
        )
        if (handled) {
          return
        }
        await this.queueSlashCommand(
          this.normalizeSlackSlashCommand(command.text),
          {
            channel: command.channel_id,
            user: command.user_id,
            externalMessageId: command.trigger_id || `lucid:${Date.now()}`,
          },
          client,
        )
      })

      app.command('/agentstatus', async ({ command, ack, respond }) => {
        await ack()
        await this.respondWithBindingStatus(client, command.channel_id, respond as SlackRespond)
      })

      app.action('lucid_refresh_home', async ({ ack, body }) => {
        await ack()
        const userId = (body as { user?: { id?: string } }).user?.id
        if (!userId) return
        await this.publishAppHome(client, userId)
      })

      app.action('lucid_bind_dm', async ({ ack, body, action }) => {
        await ack()
        const userId = (body as { user?: { id?: string } }).user?.id
        const assistantChannelId = (action as { value?: string }).value
        if (!userId || !assistantChannelId || !client.teamId) return
        const dmChannelId = await client.openDm({ userId })
        if (!dmChannelId) return
        await this.bindConversationAndConfirm(
          client,
          {
            assistantChannelId,
            slackChannelId: dmChannelId,
            boundVia: 'dm_bind',
          },
          {
            confirmChannelId: dmChannelId,
            confirmTextPrefix: 'Lucid bound this DM to',
          },
        )
        await this.publishAppHome(client, userId)
      })

      app.action('lucid_choose_channel', async ({ ack, body, action }) => {
        await ack()
        const userId = (body as { user?: { id?: string } }).user?.id
        const triggerId = (body as { trigger_id?: string }).trigger_id
        const assistantChannelId = (action as { value?: string }).value
        if (!userId || !triggerId || !assistantChannelId) return
        const install = await this.getInstallForAction(client, assistantChannelId)
        if (!install) return
        await client.openModal({
          triggerId,
          view: buildSlackChooseChannelModal({
            assistantChannelId: install.id,
            assistantName: install.assistantName,
            userId,
          }),
        })
      })

      app.action('lucid_unbind', async ({ ack, body, action }) => {
        await ack()
        const userId = (body as { user?: { id?: string } }).user?.id
        const assistantChannelId = (action as { value?: string }).value
        if (!userId || !assistantChannelId || !client.teamId) return
        const currentBinding = await this.getInstallForAction(client, assistantChannelId)
        const unbound = await unbindHostedSlackInstallById(this.supabase, {
          teamId: client.teamId,
          assistantChannelId,
        })
        if (!unbound) return
        if (currentBinding?.externalChannelId) {
          client.channels.delete(currentBinding.externalChannelId)
        } else {
          this.deleteChannelMappingByInternalId(client, assistantChannelId)
        }
        await this.publishAppHome(client, userId)
        await this.sendConfirmationToUser(
          client,
          userId,
          `${unbound.assistantName} is no longer bound in Slack.`,
        )
      })

      app.action(SLACK_AGENT_OPS_MENU_ACTION_ID, async ({ ack, body, action }) => {
        await ack()
        const userId = (body as { user?: { id?: string } }).user?.id
        const channelId = (body as { channel?: { id?: string } }).channel?.id
        const triggerId = (body as { trigger_id?: string }).trigger_id
        const workflowToken = (action as { value?: string }).value
        if (!userId || !channelId || !triggerId || !getSlackAgentOpsMenuWorkflow(workflowToken)) {
          return
        }
        await client.openModal({
          triggerId,
          view: buildSlackAgentOpsLaunchModal({
            workflowToken: workflowToken!,
            channelId,
            userId,
          }),
        })
      })

      app.view('lucid_bind_channel', async ({ ack, body, view }) => {
        const metadata = this.parseViewMetadata(view?.private_metadata)
        const actorUserId = (body as { user?: { id?: string } }).user?.id
        const selectedConversation = this.readSelectedConversation(
          view?.state?.values,
          'channel_picker',
          'selected_conversation',
        )
        if (
          !metadata?.assistantChannelId ||
          !metadata.userId ||
          !selectedConversation ||
          !actorUserId ||
          actorUserId !== metadata.userId
        ) {
          await ack({
            response_action: 'errors',
            errors: { channel_picker: 'Choose a Slack channel to continue.' },
          })
          return
        }
        await ack()
        if (!client.teamId) return
        await this.bindConversationAndConfirm(
          client,
          {
            assistantChannelId: metadata.assistantChannelId,
            slackChannelId: selectedConversation,
            boundVia: 'modal_bind',
          },
          {
            confirmUserId: metadata.userId,
            confirmTextPrefix: 'Lucid bound',
          },
        )
        await this.publishAppHome(client, metadata.userId)
      })

      app.view(SLACK_AGENT_OPS_MODAL_CALLBACK_ID, async ({ ack, body, view }) => {
        const metadata = this.parseViewMetadata(view?.private_metadata)
        const actorUserId = (body as { user?: { id?: string } }).user?.id
        const workflowToken = typeof metadata?.workflowToken === 'string'
          ? metadata.workflowToken
          : null
        const channelId = typeof metadata?.channelId === 'string' ? metadata.channelId : null
        const userId = typeof metadata?.userId === 'string' ? metadata.userId : null
        const target = readSlackPlainTextInput(
          view?.state?.values,
          SLACK_AGENT_OPS_TARGET_BLOCK_ID,
          SLACK_AGENT_OPS_TARGET_ACTION_ID,
        )
        const notes = readSlackPlainTextInput(
          view?.state?.values,
          SLACK_AGENT_OPS_NOTES_BLOCK_ID,
          SLACK_AGENT_OPS_NOTES_ACTION_ID,
        )

        const targetError = workflowToken
          ? validateSlackAgentOpsModalTarget({ workflowToken, target })
          : 'Add the target for this workflow.'
        if (
          !workflowToken ||
          !getSlackAgentOpsMenuWorkflow(workflowToken) ||
          !channelId ||
          !userId ||
          !actorUserId ||
          actorUserId !== userId ||
          targetError
        ) {
          await ack({
            response_action: 'errors',
            errors: {
              [SLACK_AGENT_OPS_TARGET_BLOCK_ID]: targetError ?? 'Add the target for this workflow.',
            },
          })
          return
        }

        await ack()
        await this.launchAgentOpsFromSlackMenu(
          {
            channelId,
            userId,
            workflowToken,
            target,
            notes,
          },
          client,
        )
      })

      app.view('lucid_bind_current_conversation', async ({ ack, body, view }) => {
        const metadata = this.parseViewMetadata(view?.private_metadata)
        const actorUserId = (body as { user?: { id?: string } }).user?.id
        const assistantChannelId = this.readSelectedStaticValue(
          view?.state?.values,
          'assistant_picker',
          'assistant_channel_id',
        )
        if (
          !metadata?.channelId ||
          !metadata.userId ||
          !assistantChannelId ||
          !actorUserId ||
          actorUserId !== metadata.userId
        ) {
          await ack({
            response_action: 'errors',
            errors: { assistant_picker: 'Choose an agent to continue.' },
          })
          return
        }
        await ack()
        if (!client.teamId) return
        await this.bindConversationAndConfirm(
          client,
          {
            assistantChannelId,
            slackChannelId: metadata.channelId,
            boundVia: 'slash_bind',
          },
          {
            confirmChannelId: metadata.channelId,
            confirmTextPrefix: 'Lucid bound this conversation to',
          },
        )
        await this.publishAppHome(client, metadata.userId)
      })

      await app.start()
      client.connected = true
      client.lastStartAt = new Date().toISOString()
      client.lastError = null
      console.log(
        `[slack-gw] Client ${tokenHash.slice(0, 8)} connected (bot: ${botUserId?.slice(0, 8) ?? 'unknown'})`,
      )
      this.clients.set(tokenHash, client)
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      console.error(`[slack-gw] Failed to create client ${tokenHash.slice(0, 8)}:`, err)
    }
  }

  private async handleMessage(
    msg: SlackInboundMessage,
    client: ManagedClient,
  ): Promise<void> {
    const mapping = client.channels.get(msg.channel) || this.findWorkspaceWideMapping(client) || null
    if (!mapping) {
      await this.maybeGuideUnboundConversation(msg, client)
      return
    }

    const config = mapping.routingConfig
    if (config.ignore_bots !== false && msg.bot_id) return
    const allowedUserIds = mapping.allowedUserIds || []
    if (allowedUserIds.length > 0 && !allowedUserIds.includes(msg.user)) return
    if (!this.shouldProcessMessage(msg, client, config)) return

    const attachments = this.getInboundAttachments(msg)
    const rawText = msg.text?.trim() || ''
    if (!rawText && attachments.length === 0) return

    const externalChatId = buildSlackExternalChatId(msg.channel, msg.thread_ts, config)
    let effectiveText = rawText
    const mentionTriggered =
      msg._isMention === true ||
      (client.botUserId ? rawText.includes(`<@${client.botUserId}>`) : false)
    if (config.prefix && rawText.startsWith(config.prefix)) {
      effectiveText = rawText.slice(config.prefix.length).trim()
    }
    if ((config.respond_on_mention || msg._isMention) && client.botUserId) {
      effectiveText = effectiveText.replace(new RegExp(`<@${client.botUserId}>`, 'g'), '').trim()
    }

    let targetChannelId = mapping.internalChannelId
    let targetAssistantId = mapping.assistantId
    const explicitTarget = this.parseSlackExplicitTarget({
      text: effectiveText,
      mentionTriggered,
    })
    if (explicitTarget && client.teamId) {
      const available = await this.listAvailableAgentsForWorkspace(client, mapping)
      const resolution = resolveAgentTarget({
        bindings: available.bindings.map((binding) => ({
          id: binding.id,
          assistantId: binding.assistantId,
          assistantName: binding.assistantName,
          aliases: binding.aliases ?? [],
        })),
        explicitTarget: explicitTarget.target,
        conversationDefault: available.conversationDefault
          ? {
              id: available.conversationDefault.id,
              assistantId: available.conversationDefault.assistantId,
              assistantName: available.conversationDefault.assistantName,
              aliases: available.conversationDefault.aliases ?? [],
            }
          : null,
      })

      if (resolution.kind === 'resolved' && resolution.source === 'explicit_target') {
        targetChannelId = resolution.binding.id
        targetAssistantId = resolution.binding.assistantId
        effectiveText = explicitTarget.remainingText
      }
    }

    if (!effectiveText && attachments.length === 0) return

    const span = getTracer().startSpan('slack.gateway.message', {
      attributes: { 'lucid.channel_type': 'slack' },
    })

    const envelope = buildSlackInboundEnvelope({
      inboundEventId: msg.ts,
      channelId: targetChannelId,
      assistantId: targetAssistantId,
      replyMode: config.dedicated_channel
        ? 'dedicated'
        : config.prefix && rawText.startsWith(config.prefix)
          ? 'prefix'
          : 'mention',
      source: {
        messageId: msg.ts,
        userId: msg.user,
        channelId: externalChatId,
        parentChannelId: msg.channel,
        rawText,
        normalizedText: effectiveText,
        threadTs: msg.thread_ts,
        threadHistoryScope: mapping.threadHistoryScope,
        threadInheritParent: mapping.threadInheritParent,
        ...(mapping.threadInitialHistoryLimit !== null
          ? { initialHistoryLimit: mapping.threadInitialHistoryLimit }
          : {}),
        rawPayload: msg as unknown as Record<string, unknown>,
        attachments: mapSlackAttachmentsToCanonical(attachments),
        source: 'message',
      },
    })

    const { data: insertedEvent, error } = await this.supabase
      .from('assistant_inbound_events')
      .insert({
        channel_id: envelope.channelId,
        assistant_id: envelope.assistantId,
        external_message_id: envelope.externalMessageId,
        external_user_id: envelope.externalUserId,
        external_chat_id: envelope.externalChatId,
        message_text: envelope.normalizedText,
        message_data: envelope.messageData,
        status: 'pending',
      })
      .select('id, assistant_id, external_message_id')
      .single()

    if (error) {
      if (isDuplicateInboundInsertError(error)) {
        console.log(`[slack-gw] Duplicate inbound ignored: ${msg.ts} -> ${targetChannelId}`)
      } else {
        console.error('[slack-gw] Failed to insert event:', error)
      }
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'insert_failed' })
    } else {
      console.log(`[slack-gw] Event queued: ${msg.ts} -> ${targetChannelId}`)
      const followUps: Promise<unknown>[] = [
        this.addAckReaction(msg, client, mapping.ackReaction),
        this.addProcessingReaction(msg, client, mapping.typingReaction),
      ]
      if (insertedEvent) {
        followUps.push(
          this.notifyInboundQueued({
            ...insertedEvent,
            org_id: mapping.orgId ?? undefined,
          }),
        )
      }
      await Promise.allSettled(followUps)
      span.setStatus({ code: SpanStatusCode.OK })
    }
    span.end()
  }

  private async handleSystemEvent(
    systemEvent: SlackSystemEventPayload,
    client: ManagedClient,
  ): Promise<void> {
    const mapping = client.channels.get(systemEvent.channelId) || null
    if (!mapping) return

    const envelope = buildSlackInboundEnvelope({
      inboundEventId: systemEvent.externalMessageId,
      channelId: mapping.internalChannelId,
      assistantId: mapping.assistantId,
      replyMode: 'dedicated',
      source: {
        messageId: systemEvent.externalMessageId,
        userId: systemEvent.actorUserId || 'slack-system',
        channelId: systemEvent.channelId,
        rawText: systemEvent.text,
        normalizedText: systemEvent.text,
        rawPayload: systemEvent.rawPayload,
        attachments: [],
        source: 'system_event',
      },
    })

    const messageData =
      envelope.messageData && typeof envelope.messageData === 'object'
        ? {
            ...envelope.messageData,
            slack_system_event: true,
            slack_event_type: systemEvent.eventType,
          }
        : {
            source: 'system_event',
            slack_system_event: true,
            slack_event_type: systemEvent.eventType,
          }

    const { data: insertedEvent, error } = await this.supabase
      .from('assistant_inbound_events')
      .insert({
        channel_id: envelope.channelId,
        assistant_id: envelope.assistantId,
        external_message_id: envelope.externalMessageId,
        external_user_id: envelope.externalUserId,
        external_chat_id: envelope.externalChatId,
        message_text: envelope.normalizedText,
        message_data: messageData,
        status: 'pending',
      })
      .select('id, assistant_id, external_message_id')
      .single()

    if (error) {
      if (isDuplicateInboundInsertError(error)) {
        console.log(
          `[slack-gw] Duplicate Slack system event ignored: ${systemEvent.eventType} -> ${mapping.internalChannelId}`,
        )
      } else {
        console.error('[slack-gw] Failed to insert Slack system event:', error)
      }
      return
    }

    console.log(
      `[slack-gw] System event queued: ${systemEvent.eventType} -> ${mapping.internalChannelId}`,
    )
    if (insertedEvent) {
      await this.notifyInboundQueued({
        ...insertedEvent,
        org_id: mapping.orgId ?? undefined,
      })
    }
  }

  private shouldProcessMessage(
    msg: Pick<SlackInboundMessage, 'text' | '_isMention' | 'thread_ts'>,
    client: ManagedClient,
    config: InboundRoutingConfig,
  ): boolean {
    if (config.dedicated_channel) return true
    if (config.thread_support === true && typeof msg.thread_ts === 'string' && msg.thread_ts.trim().length > 0) {
      return true
    }
    if (config.prefix && msg.text?.startsWith(config.prefix)) return true
    if (config.respond_on_mention) {
      if (msg._isMention) return true
      if (client.botUserId && msg.text?.includes(`<@${client.botUserId}>`)) {
        return true
      }
    }
    return false
  }

  private parseSlackExplicitTarget(params: {
    text: string
    mentionTriggered: boolean
  }): { target: string; remainingText: string } | null {
    if (!params.mentionTriggered) return null

    const tokens = params.text.trim().split(/\s+/).filter(Boolean)
    if (tokens.length < 2) return null

    return {
      target: tokens[0]!,
      remainingText: tokens.slice(1).join(' ').trim(),
    }
  }

  private getInboundAttachments(msg: SlackInboundMessage) {
    return mapSlackFilesToAttachments(msg.files)
  }

  private normalizeSlackSlashCommand(text: string | undefined): string {
    const trimmed = text?.trim() || ''
    if (!trimmed) return '/help'
    const [rawCommand, ...rest] = trimmed.split(/\s+/)
    const command = rawCommand.toLowerCase()
    const args = rest.join(' ').trim()
    const mapped =
      command === 'whoami' || command === 'agent'
        ? '/status'
        : ['help', 'status', 'reset', 'usage', 'compact'].includes(command)
          ? `/${command}`
          : '/help'
    return args ? `${mapped} ${args}` : mapped
  }

  private async listAvailableAgentsForWorkspace(
    client: ManagedClient,
    currentMapping: ChannelMapping | null,
  ): Promise<{
    bindings: SlackHostedAssistantBinding[]
    conversationDefault: SlackHostedAssistantBinding | null
  }> {
    if (!client.teamId) {
      return { bindings: [], conversationDefault: null }
    }

    const [boundBindings, installs, currentBinding] = await Promise.all([
      listBoundHostedSlackBindings(this.supabase, client.teamId),
      listUnboundHostedSlackInstalls(this.supabase, client.teamId),
      currentMapping ? this.getInstallForAction(client, currentMapping.internalChannelId) : Promise.resolve(null),
    ])

    const bindings = new Map<string, SlackHostedAssistantBinding>()
    for (const binding of [...boundBindings, ...installs]) {
      bindings.set(binding.id, binding)
    }
    if (currentBinding) {
      bindings.set(currentBinding.id, currentBinding)
    }

    return {
      bindings: Array.from(bindings.values()),
      conversationDefault: currentBinding,
    }
  }

  private async queueSlackPromptToBinding(
    text: string,
    event: { channel: string; user: string; externalMessageId: string; threadTs?: string },
    binding: Pick<SlackHostedAssistantBinding, 'id' | 'assistantId'> & { orgId?: string | null },
  ): Promise<boolean> {
    const envelope = buildSlackInboundEnvelope({
      inboundEventId: event.externalMessageId,
      channelId: binding.id,
      assistantId: binding.assistantId,
      replyMode: 'direct',
      source: {
        messageId: event.externalMessageId,
        userId: event.user,
        channelId: event.channel,
        parentChannelId: event.channel,
        rawText: text,
        normalizedText: text,
        threadTs: event.threadTs,
        rawPayload: {
          type: 'slack_command',
          text,
          channel: event.channel,
          user: event.user,
          ...(event.threadTs ? { thread_ts: event.threadTs } : {}),
        },
        attachments: [],
        source: 'slash_command',
      },
    })

    const { data: insertedEvent, error } = await this.supabase
      .from('assistant_inbound_events')
      .insert({
        channel_id: envelope.channelId,
        assistant_id: envelope.assistantId,
        external_message_id: envelope.externalMessageId,
        external_user_id: envelope.externalUserId,
        external_chat_id: envelope.externalChatId,
        message_text: envelope.normalizedText,
        message_data: envelope.messageData,
        status: 'pending',
      })
      .select('id, assistant_id, external_message_id')
      .single()

    if (error) {
      console.error('[slack-gw] Failed to queue explicit Slack prompt:', error)
      return false
    }

    if (insertedEvent) {
      await this.notifyInboundQueued({
        ...insertedEvent,
        org_id: binding.orgId ?? undefined,
      })
    }
    return true
  }

  private async queueSlashCommand(
    text: string,
    event: { channel: string; user: string; externalMessageId: string },
    client: ManagedClient,
  ): Promise<void> {
    const mapping = client.channels.get(event.channel) || null
    if (!mapping) {
      await client.postMessage({
        channel: event.channel,
        text: 'This Slack conversation is not bound to a Lucid agent yet. Use /lucid bind here or open the Lucid app home to choose a channel.',
      })
      return
    }

    const envelope = buildSlackInboundEnvelope({
      inboundEventId: event.externalMessageId,
      channelId: mapping.internalChannelId,
      assistantId: mapping.assistantId,
      replyMode: 'direct',
      source: {
        messageId: event.externalMessageId,
        userId: event.user,
        channelId: event.channel,
        rawText: text,
        normalizedText: text,
        rawPayload: {
          type: 'slack_command',
          text,
          channel: event.channel,
          user: event.user,
        },
        attachments: [],
        source: 'slash_command',
      },
    })

    const { data: insertedEvent, error } = await this.supabase
      .from('assistant_inbound_events')
      .insert({
        channel_id: envelope.channelId,
        assistant_id: envelope.assistantId,
        external_message_id: envelope.externalMessageId,
        external_user_id: envelope.externalUserId,
        external_chat_id: envelope.externalChatId,
        message_text: envelope.normalizedText,
        message_data: envelope.messageData,
        status: 'pending',
      })
      .select('id, assistant_id, external_message_id')
      .single()

    if (error) {
      console.error('[slack-gw] Failed to queue slash command:', error)
      await client.postMessage({
        channel: event.channel,
        text: 'Slack command failed to queue. Try again in a moment.',
      })
      return
    }

    if (insertedEvent) {
      await this.notifyInboundQueued({
        ...insertedEvent,
        org_id: mapping.orgId ?? undefined,
      })
    }
  }

  private async handleLucidSlashCommand(
    command: {
      text: string | undefined
      channelId: string
      userId: string
      triggerId?: string
    },
    client: ManagedClient,
    respond: SlackRespond,
  ): Promise<boolean> {
    const trimmed = command.text?.trim() || ''
    const [rawCommand] = trimmed.split(/\s+/, 1)
    const action = rawCommand.toLowerCase()

    if (!action) {
      await this.respondSlackAgentOpsMenu(respond)
      return true
    }
    if (action === 'bind') {
      await this.handleBindSlashCommand(command, client, respond)
      return true
    }
    if (action === 'agents') {
      await this.respondWithAvailableAgents(client, command.channelId, respond)
      return true
    }
    if (action === 'switch') {
      await this.handleSwitchSlashCommand(command, client, respond)
      return true
    }
    if (action === 'whoami' || action === 'agent') {
      await this.respondWithBindingStatus(client, command.channelId, respond)
      return true
    }
    if (action === 'status') {
      await this.respondWithSlackOpsStatus(client, command.channelId, respond, false)
      return true
    }
    if (normalizeSlackAgentOpsCommandArg(command.text) != null) {
      await this.handleAgentOpsSlashCommand(command, client, respond)
      return true
    }
    if (action === 'probe') {
      await this.respondWithSlackOpsStatus(client, command.channelId, respond, true)
      return true
    }
    if (action === 'unbind' || action === 'leave') {
      await this.handleUnbindSlashCommand(command.channelId, client, respond)
      return true
    }
    if (action === 'help') {
      await this.respondSlackHelp(respond)
      return true
    }

    const explicitPrompt = trimmed.split(/\s+/).slice(1).join(' ').trim()
    if (explicitPrompt && client.teamId) {
      const currentMapping =
        client.channels.get(command.channelId) || this.findWorkspaceWideMapping(client) || null
      const available = await this.listAvailableAgentsForWorkspace(client, currentMapping)
      const resolution = resolveAgentTarget({
        bindings: available.bindings.map((binding) => ({
          id: binding.id,
          assistantId: binding.assistantId,
          assistantName: binding.assistantName,
          aliases: binding.aliases ?? [],
        })),
        explicitTarget: action,
        conversationDefault: available.conversationDefault
          ? {
              id: available.conversationDefault.id,
              assistantId: available.conversationDefault.assistantId,
              assistantName: available.conversationDefault.assistantName,
              aliases: available.conversationDefault.aliases ?? [],
            }
          : null,
      })

      if (resolution.kind === 'resolved' && resolution.source === 'explicit_target') {
        const queued = await this.queueSlackPromptToBinding(
          explicitPrompt,
          {
            channel: command.channelId,
            user: command.userId,
            externalMessageId: command.triggerId || `lucid:${Date.now()}`,
          },
          resolution.binding,
        )
        if (!queued) {
          await this.respondEphemeral(
            respond,
            'Slack command failed to queue. Try again in a moment.',
          )
        }
        return true
      }

      if (resolution.kind === 'ambiguous') {
        await this.respondEphemeral(
          respond,
          `Multiple agents match "${action}". Use a more specific name or run \`/lucid agents\`.`,
        )
        return true
      }

      if (resolution.kind === 'unresolved' && resolution.reason === 'explicit_target_not_found') {
        await this.respondEphemeral(
          respond,
          `I could not find an agent named "${action}". Use \`/lucid agents\` to see what is available.`,
        )
        return true
      }
    }

    return false
  }

  private async handleAgentOpsSlashCommand(
    command: { text: string | undefined; channelId: string; userId: string },
    client: ManagedClient,
    respond: SlackRespond,
  ): Promise<void> {
    const rawCommandArg = normalizeSlackAgentOpsCommandArg(command.text) ?? ''
    const mapping = client.channels.get(command.channelId) || this.findWorkspaceWideMapping(client) || null
    if (!mapping) {
      await this.respondEphemeral(
        respond,
        'This Slack conversation is not bound to a Lucid agent yet. Use `/lucid bind` or open the Lucid app home first.',
      )
      return
    }

    void (async () => {
      try {
        const reports = await launchSlackAgentOpsMessagesFromControlPlane({
          surfaceId: command.channelId,
          externalUserId: command.userId,
          rawCommandArg,
          binding: {
            assistant_id: mapping.assistantId,
            org_id: mapping.orgId,
          },
        })
        for (const report of reports) {
          await this.respondEphemeral(respond, report)
        }
      } catch (error) {
        console.error('[slack-gw] Failed to launch Slack Agent Ops command:', error)
        await this.respondEphemeral(
          respond,
          'Slack Agent Ops launch failed while contacting Lucid. Try again in a moment.',
        )
      }
    })()
  }

  private async launchAgentOpsFromSlackMenu(
    input: {
      channelId: string
      userId: string
      workflowToken: string
      target: string
      notes?: string
    },
    client: ManagedClient,
  ): Promise<void> {
    const mapping = client.channels.get(input.channelId) || this.findWorkspaceWideMapping(client) || null
    if (!mapping) {
      await client.postEphemeral({
        channel: input.channelId,
        user: input.userId,
        text: 'This Slack conversation is not bound to a Lucid agent yet. Use `/lucid bind` or open the Lucid app home first.',
      })
      return
    }

    await client.postEphemeral({
      channel: input.channelId,
      user: input.userId,
      text: 'Starting Agent Ops...',
    })

    const reports = await launchSlackAgentOpsMessagesFromControlPlane({
      surfaceId: input.channelId,
      externalUserId: input.userId,
      rawCommandArg: composeSlackAgentOpsRawCommandArg(input),
      binding: {
        assistant_id: mapping.assistantId,
        org_id: mapping.orgId,
      },
    })

    for (const report of reports) {
      await client.postEphemeral({
        channel: input.channelId,
        user: input.userId,
        text: report,
      })
    }
  }

  private async handleSwitchSlashCommand(
    command: { text: string | undefined; channelId: string },
    client: ManagedClient,
    respond: SlackRespond,
  ): Promise<void> {
    if (!client.teamId) {
      await this.respondEphemeral(respond, 'Slack team context is unavailable.')
      return
    }

    const requestedName = command.text?.trim().split(/\s+/).slice(1).join(' ').trim().toLowerCase() || ''
    if (!requestedName) {
      await this.respondWithAvailableAgents(client, command.channelId, respond)
      return
    }

    const currentBinding = await getHostedSlackBindingForConversation(this.supabase, {
      teamId: client.teamId,
      slackChannelId: command.channelId,
    })
    const installs = await listUnboundHostedSlackInstalls(this.supabase, client.teamId)
    const availableAgents = [
      ...(currentBinding ? [currentBinding] : []),
      ...installs,
    ]

    const resolution = resolveAgentTarget({
      bindings: availableAgents.map((binding) => ({
        id: binding.id,
        assistantId: binding.assistantId,
        assistantName: binding.assistantName,
        aliases: binding.aliases ?? [],
      })),
      explicitTarget: requestedName,
      conversationDefault: currentBinding
        ? {
            id: currentBinding.id,
            assistantId: currentBinding.assistantId,
            assistantName: currentBinding.assistantName,
            aliases: currentBinding.aliases ?? [],
          }
        : null,
    })

    if (resolution.kind === 'unresolved') {
      await this.respondEphemeral(
        respond,
        'I could not find that agent for this conversation. Use `/lucid agents` to see what is available.',
      )
      return
    }

    if (resolution.kind === 'ambiguous') {
      await this.respondEphemeral(
        respond,
        `Multiple agents match "${requestedName}". Use a more specific name or run \`/lucid agents\`.`,
      )
      return
    }

    const target = resolution.binding
    if (currentBinding?.id === target.id) {
      await this.respondEphemeral(
        respond,
        `${target.assistantName} is already active in this conversation.`,
      )
      return
    }

    if (currentBinding) {
      const unbound = await unbindHostedSlackConversation(this.supabase, {
        teamId: client.teamId,
        slackChannelId: command.channelId,
      })
      if (!unbound) {
        await this.respondEphemeral(
          respond,
          'I could not switch agents right now. Please try again.',
        )
        return
      }
      client.channels.delete(command.channelId)
    }

    const result = await this.bindConversationAndConfirm(
      client,
      {
        assistantChannelId: target.id,
        slackChannelId: command.channelId,
        boundVia: 'slash_bind',
      },
      {
        confirmChannelId: command.channelId,
        confirmTextPrefix: 'Lucid switched this conversation to',
      },
    )

    if (!result.ok) {
      await this.respondEphemeral(
        respond,
        'I could not switch agents right now. Please try again.',
      )
    }
  }

  private async handleBindSlashCommand(
    command: { channelId: string; userId: string; triggerId?: string },
    client: ManagedClient,
    respond: SlackRespond,
  ): Promise<void> {
    if (!client.teamId) {
      await this.respondEphemeral(respond, 'Slack team context is unavailable.')
      return
    }

    const currentBinding = await getHostedSlackBindingForConversation(this.supabase, {
      teamId: client.teamId,
      slackChannelId: command.channelId,
    })
    if (currentBinding) {
      await this.respondEphemeral(
        respond,
        `${currentBinding.assistantName} is already active here. Use /lucid unbind first if you want to move it.`,
      )
      return
    }

    const installs = await listUnboundHostedSlackInstalls(this.supabase, client.teamId)
    if (installs.length === 0) {
      await this.respondEphemeral(
        respond,
        'No unbound Lucid agents are installed in this Slack workspace right now. Install an agent from Lucid first.',
      )
      return
    }

    if (installs.length === 1) {
      const result = await this.bindConversationAndConfirm(
        client,
        {
          assistantChannelId: installs[0].id,
          slackChannelId: command.channelId,
          boundVia: 'slash_bind',
        },
        {
          confirmChannelId: command.channelId,
          confirmTextPrefix: 'Lucid bound this conversation to',
        },
      )
      if (!result.ok) {
        await this.respondEphemeral(respond, 'Slack bind failed. Try again in a moment.')
      }
      return
    }

    if (!command.triggerId) {
      await this.respondEphemeral(
        respond,
        'Multiple unbound agents are installed. Open the Lucid app home to choose one.',
      )
      return
    }

    await client.openModal({
      triggerId: command.triggerId,
      view: buildSlackChooseAgentForConversationModal({
        channelId: command.channelId,
        userId: command.userId,
        installs,
      }),
    })
  }

  private async handleUnbindSlashCommand(
    channelId: string,
    client: ManagedClient,
    respond: SlackRespond,
  ): Promise<void> {
    if (!client.teamId) {
      await this.respondEphemeral(respond, 'Slack team context is unavailable.')
      return
    }

    const current = await unbindHostedSlackConversation(this.supabase, {
      teamId: client.teamId,
      slackChannelId: channelId,
    })
    if (!current) {
      await this.respondEphemeral(
        respond,
        'No Lucid agent is currently bound to this Slack conversation.',
      )
      return
    }

    client.channels.delete(channelId)
    await this.respondInChannel(respond, `${current.assistantName} is no longer active here.`)
  }

  private async respondWithBindingStatus(
    client: ManagedClient,
    channelId: string,
    respond: SlackRespond,
  ): Promise<void> {
    if (!client.teamId) {
      await this.respondEphemeral(respond, 'Slack team context is unavailable.')
      return
    }

    const binding = await getHostedSlackBindingForConversation(this.supabase, {
      teamId: client.teamId,
      slackChannelId: channelId,
    })
    const installs = await listUnboundHostedSlackInstalls(this.supabase, client.teamId)
    if (!binding) {
      await this.respondEphemeral(
        respond,
        installs.length > 0
          ? `No Lucid agent is active here yet. ${installs.length} installed agent${installs.length === 1 ? ' is' : 's are'} ready to bind. Use /lucid bind or open the app home.`
          : 'No Lucid agent is active here.',
      )
      return
    }
    const activity = await getHostedSlackActivitySnapshot(this.supabase, binding.id)

    await this.respondEphemeral(
      respond,
      [
        `Active agent: ${binding.assistantName}`,
        this.describeBindingSurface(binding),
        `Routing: ${this.describeBindingRouting(binding)}`,
        `Delivery UX: ${this.describeBindingDeliveryUx(binding)}`,
        this.describeBindingAllowedUsers(binding),
        activity.lastOutboundAt
          ? `Last outbound: ${activity.lastOutboundStatus || 'sent'} at ${this.formatSlackStatusTimestamp(activity.lastOutboundAt)}`
          : 'Last outbound: none yet',
        typeof activity.lastReplyLatencyMs === 'number'
          ? `Last reply latency: ${Math.round(activity.lastReplyLatencyMs / 100) / 10}s`
          : null,
        activity.lastOutboundError ? `Last error: ${activity.lastOutboundError}` : null,
        installs.length > 0
          ? `${installs.length} more installed agent${installs.length === 1 ? '' : 's'} can be switched in here with /lucid switch <agent>.`
          : 'No other installed agents are ready to switch into this conversation.',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  private describeBindingSurface(binding: SlackHostedAssistantBinding): string {
    const config =
      binding.channelConfig && typeof binding.channelConfig === 'object'
        ? binding.channelConfig
        : {}
    const configuredLabel =
      typeof config.slack_conversation_label === 'string' && config.slack_conversation_label.trim().length > 0
        ? config.slack_conversation_label.trim()
        : null
    if (configuredLabel) {
      return `Surface: ${configuredLabel}`
    }
    if (binding.externalChannelId?.startsWith('D')) {
      return 'Surface: DM'
    }
    return `Surface: <#${binding.externalChannelId}>`
  }

  private async respondWithAvailableAgents(
    client: ManagedClient,
    channelId: string,
    respond: SlackRespond,
  ): Promise<void> {
    if (!client.teamId) {
      await this.respondEphemeral(respond, 'Slack team context is unavailable.')
      return
    }

    const currentBinding = await getHostedSlackBindingForConversation(this.supabase, {
      teamId: client.teamId,
      slackChannelId: channelId,
    })
    const installs = await listUnboundHostedSlackInstalls(this.supabase, client.teamId)

    const lines: string[] = []
    if (currentBinding) {
      lines.push(`• ${currentBinding.assistantName} (active here)`)
    }
    for (const install of installs) {
      lines.push(`• ${install.assistantName} (ready to switch in)`)
    }

    if (lines.length === 0) {
      await this.respondEphemeral(
        respond,
        'No Lucid agents are available in this Slack workspace yet. Install one from Lucid first.',
      )
      return
    }

    await this.respondEphemeral(
      respond,
      [
        'Agents available for this conversation:',
        ...lines,
        '',
        'Use `/lucid switch <agent>` to make one of them active here.',
      ].join('\n'),
    )
  }

  private async respondSlackAgentOpsMenu(respond: SlackRespond): Promise<void> {
    await this.respondEphemeral(
      respond,
      'Launch Agent Ops from Slack. Choose a workflow or type `/lucid help` for all commands.',
      buildSlackAgentOpsMenuBlocks(),
    )
  }

  private async respondSlackHelp(respond: SlackRespond): Promise<void> {
    await this.respondEphemeral(
      respond,
      [
        'Lucid Slack commands:',
        '/lucid - open the Agent Ops picker',
        '/lucid bind - bind an installed agent to this conversation',
        '/lucid agents - list agents available for this conversation',
        '/lucid switch <agent> - swap the active agent here',
        '/lucid whoami - show which agent is active here',
        '/lucid status - show Slack worker health plus the active binding',
        '/lucid ops <workflow> <target> - launch Agent Ops for this Slack conversation',
        '/lucid check <url> - check a page with Browser Operator',
        '/lucid buy <request> - prepare a governed purchase with cart, policy, approval, and receipt evidence',
        '/lucid research <url> - research a website or competitor page',
        '/lucid plan <goal> - start plan-only Agent Ops',
        '/lucid search <query> - search Mission Control',
        '/lucid remember <fact> - save a Knowledge claim',
        '/lucid claims <query> - list active Knowledge claims',
        '/lucid forget <id> - archive a Knowledge claim',
        '/lucid extract <what> from <url> - extract structured web data',
        '/lucid monitor <url> - start a page-monitoring run',
        '/lucid probe - run a live Slack bot probe',
        '/lucid unbind - remove the current binding',
        '/lucid leave - alias for unbind',
        '/lucid help - show this help',
        '/agentstatus - quick status for the current conversation',
        '',
        'Routing tips:',
        'Dedicated conversations answer every message.',
        '@mentions and prefixes can also be enabled from Lucid’s Slack panel.',
      ].join('\n'),
    )
  }

  private async respondWithSlackOpsStatus(
    client: ManagedClient,
    channelId: string,
    respond: SlackRespond,
    runProbe: boolean,
  ): Promise<void> {
    const binding = client.teamId
      ? await getHostedSlackBindingForConversation(this.supabase, {
          teamId: client.teamId,
          slackChannelId: channelId,
        })
      : null
    const activity = binding ? await getHostedSlackActivitySnapshot(this.supabase, binding.id) : null
    const probe = runProbe ? await this.probeHostedBot() : this.getAdminStatus().probe
    const status = this.getAdminStatus()
    const botLabel =
      probe?.bot?.name ||
      status.stats.clientDetails[0]?.botName ||
      probe?.bot?.id ||
      status.stats.clientDetails[0]?.botUserId ||
      'unknown'

    await this.respondEphemeral(
      respond,
      [
        `Configured: ${status.configured ? 'Yes' : 'No'}`,
        `Running: ${status.running ? 'Yes' : 'No'}`,
        `Bot: ${botLabel}`,
        probe
          ? `Probe: ${probe.ok ? 'ok' : 'failed'} • HTTP ${probe.status ?? 'n/a'} • ${probe.elapsedMs}ms`
          : 'Probe: none yet',
        status.lastRefreshAt
          ? `Last worker refresh: ${this.formatSlackStatusTimestamp(status.lastRefreshAt)}`
          : null,
        status.lastError ? `Last error: ${status.lastError}` : null,
        binding ? `Active agent: ${binding.assistantName}` : 'Active agent: none',
        binding ? this.describeBindingSurface(binding) : null,
        binding ? `Routing: ${this.describeBindingRouting(binding)}` : null,
        binding ? `Delivery UX: ${this.describeBindingDeliveryUx(binding)}` : null,
        activity?.lastOutboundAt
          ? `Last outbound: ${activity.lastOutboundStatus || 'sent'} at ${this.formatSlackStatusTimestamp(activity.lastOutboundAt)}`
          : binding
            ? 'Last outbound: none yet'
            : null,
        typeof activity?.lastReplyLatencyMs === 'number'
          ? `Last reply latency: ${Math.round(activity.lastReplyLatencyMs / 100) / 10}s`
          : null,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  private describeBindingRouting(binding: SlackHostedAssistantBinding): string {
    const config = normalizeSlackInboundRoutingConfig(binding.inboundRoutingConfig)
    const parts: string[] = []
    if (config.dedicated_channel) {
      parts.push('every message')
    }
    if (config.respond_on_mention) {
      parts.push('@mentions')
    }
    if (typeof config.prefix === 'string' && config.prefix.trim().length > 0) {
      parts.push(`prefix ${config.prefix.trim()}`)
    }
    if (config.thread_support) {
      parts.push('threads')
    }
    return parts.length > 0 ? parts.join(', ') : 'no message triggers'
  }

  private describeBindingDeliveryUx(binding: SlackHostedAssistantBinding): string {
    const config =
      binding.channelConfig && typeof binding.channelConfig === 'object'
        ? binding.channelConfig
        : {}
    const streamingPreview = config.slack_streaming_preview !== false
    const streamingMode =
      config.slack_streaming_mode === 'off' ||
      config.slack_streaming_mode === 'block' ||
      config.slack_streaming_mode === 'progress'
        ? config.slack_streaming_mode
        : 'partial'
    const nativeStreaming = config.slack_native_streaming === true
    const ackReaction =
      Object.prototype.hasOwnProperty.call(config, 'slack_ack_reaction') &&
      (!config.slack_ack_reaction || typeof config.slack_ack_reaction !== 'string')
        ? null
        : typeof config.slack_ack_reaction === 'string' &&
            config.slack_ack_reaction.trim().length > 0
          ? config.slack_ack_reaction.trim()
          : 'eyes'
    const typingReaction =
      Object.prototype.hasOwnProperty.call(config, 'slack_typing_reaction') &&
      (!config.slack_typing_reaction || typeof config.slack_typing_reaction !== 'string')
        ? null
        : typeof config.slack_typing_reaction === 'string' &&
            config.slack_typing_reaction.trim().length > 0
          ? config.slack_typing_reaction.trim()
          : 'hourglass_flowing_sand'
    const threadHistoryScope =
      config.slack_thread_history_scope === 'channel' ? 'include channel context' : 'thread only'
    const replyToMode =
      config.slack_reply_to_mode === 'first' || config.slack_reply_to_mode === 'all'
        ? config.slack_reply_to_mode
        : 'off'
    const inheritParent = config.slack_thread_inherit_parent === true ? 'yes' : 'no'
    const initialHistoryLimit =
      typeof config.slack_thread_initial_history_limit === 'number' &&
      Number.isInteger(config.slack_thread_initial_history_limit) &&
      config.slack_thread_initial_history_limit >= 0
        ? String(config.slack_thread_initial_history_limit)
        : 'default'
    const replyThreading =
      replyToMode === 'off'
        ? 'chat only'
        : replyToMode === 'first'
          ? 'first reply only'
          : 'all reply chunks'
    return `ack ${ackReaction ? `:${ackReaction}:` : 'off'}, live preview ${streamingPreview ? 'on' : 'off'}, streaming mode ${streamingMode}${nativeStreaming ? ' + native' : ''}, typing ${typingReaction ? `:${typingReaction}:` : 'off'}, reply threading ${replyThreading}, thread context ${threadHistoryScope}, inherit parent ${inheritParent}, initial history ${initialHistoryLimit}`
  }

  private describeBindingAllowedUsers(binding: SlackHostedAssistantBinding): string | null {
    const config =
      binding.channelConfig && typeof binding.channelConfig === 'object'
        ? binding.channelConfig
        : {}
    const users = Array.isArray(config.slack_allowed_user_ids)
      ? config.slack_allowed_user_ids.filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0,
        )
      : []
    return users.length > 0 ? `Allowed users: ${users.join(', ')}` : null
  }

  private async bindConversationAndConfirm(
    client: ManagedClient,
    params: {
      assistantChannelId: string
      slackChannelId: string
      boundVia: 'slash_bind' | 'dm_bind' | 'app_home' | 'modal_bind'
    },
    options: {
      confirmChannelId?: string
      confirmUserId?: string
      confirmTextPrefix: string
    },
  ) {
    if (!client.teamId) return { ok: false as const, reason: 'wrong_team' as const }
    const conversationMeta =
      params.boundVia === 'dm_bind'
        ? {
            label: 'Direct message',
            type: 'im' as const,
          }
        : await client.getConversationMeta({ channelId: params.slackChannelId })
    const result = await bindHostedSlackInstallToConversation(this.supabase, {
      teamId: client.teamId,
      assistantChannelId: params.assistantChannelId,
      slackChannelId: params.slackChannelId,
      boundVia: params.boundVia,
      conversationLabel: conversationMeta.label,
      conversationType: conversationMeta.type,
    })
    if (!result.ok || !result.binding) {
      if (options.confirmUserId) {
        await this.sendConfirmationToUser(
          client,
          options.confirmUserId,
          result.reason === 'target_conflict' && result.replacedBinding
            ? `${result.replacedBinding.assistantName} is already active in that conversation.`
            : 'Slack bind failed. Try again in a moment.',
        )
      }
      return result
    }

    if (result.previousExternalChannelId && result.previousExternalChannelId !== params.slackChannelId) {
      client.channels.delete(result.previousExternalChannelId)
    }
    this.upsertClientMapping(client, result.binding, params.slackChannelId)

    const confirmationText = `${options.confirmTextPrefix} ${result.binding.assistantName}.`
    if (options.confirmChannelId) {
      await client.postMessage({
        channel: options.confirmChannelId,
        text: confirmationText,
      })
    } else if (options.confirmUserId) {
      await this.sendConfirmationToUser(client, options.confirmUserId, confirmationText)
    }
    return result
  }

  private upsertClientMapping(
    client: ManagedClient,
    binding: SlackHostedAssistantBinding,
    slackChannelId: string,
  ): void {
    this.deleteChannelMappingByInternalId(client, binding.id)
    client.channels.set(slackChannelId, {
      internalChannelId: binding.id,
      assistantId: binding.assistantId,
      orgId: binding.orgId,
      externalChannelId: slackChannelId,
      workspaceWideEnabled: false,
      routingConfig: normalizeSlackInboundRoutingConfig(binding.inboundRoutingConfig),
      ackReaction: resolveSlackAckReaction(
        binding.channelConfig as Record<string, unknown> | null,
      ),
      typingReaction: resolveSlackProcessingReaction(
        binding.channelConfig as Record<string, unknown> | null,
      ),
      allowedUserIds: resolveSlackAllowedUserIds(
        binding.channelConfig as Record<string, unknown> | null,
      ),
      threadHistoryScope: resolveSlackThreadHistoryScope(
        binding.channelConfig as Record<string, unknown> | null,
      ),
      threadInheritParent: resolveSlackThreadInheritParent(
        binding.channelConfig as Record<string, unknown> | null,
      ),
      threadInitialHistoryLimit: resolveSlackThreadInitialHistoryLimit(
        binding.channelConfig as Record<string, unknown> | null,
      ),
    })
  }

  private deleteChannelMappingByInternalId(
    client: ManagedClient,
    internalChannelId: string,
  ): void {
    for (const [channelId, mapping] of client.channels.entries()) {
      if (mapping.internalChannelId === internalChannelId) {
        client.channels.delete(channelId)
      }
    }
  }

  private findWorkspaceWideMapping(client: ManagedClient): ChannelMapping | null {
    for (const mapping of client.channels.values()) {
      if (mapping.workspaceWideEnabled) {
        return mapping
      }
    }
    return null
  }

  private async maybeGuideUnboundConversation(
    msg: SlackInboundMessage,
    client: ManagedClient,
  ): Promise<void> {
    if (!client.teamId) return
    if (this.findWorkspaceWideMapping(client)) return
    const installs = await listUnboundHostedSlackInstalls(this.supabase, client.teamId)
    if (installs.length === 0) return
    const looksLikeDirectSurface =
      msg._isMention === true ||
      (typeof msg.channel === 'string' && msg.channel.startsWith('D'))
    if (!looksLikeDirectSurface) return
    await client.postMessage({
      channel: msg.channel,
      text: 'This Slack conversation is not bound to a Lucid agent yet. Use /lucid bind here or open the Lucid app home to choose a channel.',
      threadTs: msg.thread_ts,
    })
  }

  private async publishAppHome(client: ManagedClient, userId: string): Promise<void> {
    if (!client.teamId) return
    const [installs, bindings] = await Promise.all([
      listUnboundHostedSlackInstalls(this.supabase, client.teamId),
      listBoundHostedSlackBindings(this.supabase, client.teamId),
    ])
    const activityEntries = await Promise.all(
      bindings.map(async (binding) => [
        binding.id,
        await getHostedSlackActivitySnapshot(this.supabase, binding.id),
      ] as const),
    )
    await client.publishHome({
      userId,
      view: buildSlackAppHomeView({
        installs,
        bindings,
        activityByBindingId: Object.fromEntries(activityEntries),
      }),
    })
  }

  private formatSlackStatusTimestamp(value: string): string {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
  }

  private async getInstallForAction(
    client: ManagedClient,
    assistantChannelId: string,
  ): Promise<SlackHostedAssistantBinding | null> {
    if (!client.teamId) return null
    return getHostedSlackInstallById(this.supabase, {
      teamId: client.teamId,
      assistantChannelId,
    })
  }

  private parseViewMetadata(
    raw: string | undefined,
  ): {
    assistantChannelId?: string
    channelId?: string
    userId?: string
    workflowToken?: string
  } | null {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return {
        assistantChannelId:
          typeof parsed.assistantChannelId === 'string' ? parsed.assistantChannelId : undefined,
        channelId: typeof parsed.channelId === 'string' ? parsed.channelId : undefined,
        userId: typeof parsed.userId === 'string' ? parsed.userId : undefined,
        workflowToken: typeof parsed.workflowToken === 'string' ? parsed.workflowToken : undefined,
      }
    } catch {
      return null
    }
  }

  private readSelectedConversation(
    values: unknown,
    blockId: string,
    actionId: string,
  ): string | null {
    if (!values || typeof values !== 'object') return null
    const block = (values as Record<string, unknown>)[blockId]
    if (!block || typeof block !== 'object') return null
    const action = (block as Record<string, unknown>)[actionId]
    if (!action || typeof action !== 'object') return null
    const selected = (action as Record<string, unknown>).selected_conversation
    return typeof selected === 'string' && selected.length > 0 ? selected : null
  }

  private readSelectedStaticValue(
    values: unknown,
    blockId: string,
    actionId: string,
  ): string | null {
    if (!values || typeof values !== 'object') return null
    const block = (values as Record<string, unknown>)[blockId]
    if (!block || typeof block !== 'object') return null
    const action = (block as Record<string, unknown>)[actionId]
    if (!action || typeof action !== 'object') return null
    const selected = (action as Record<string, unknown>).selected_option
    if (!selected || typeof selected !== 'object') return null
    const value = (selected as Record<string, unknown>).value
    return typeof value === 'string' && value.length > 0 ? value : null
  }

  private async sendConfirmationToUser(
    client: ManagedClient,
    userId: string,
    text: string,
  ): Promise<void> {
    const dmChannelId = await client.openDm({ userId })
    if (!dmChannelId) return
    await client.postMessage({ channel: dmChannelId, text })
  }

  private async respondEphemeral(
    respond: SlackRespond,
    text: string,
    blocks?: Record<string, unknown>[],
  ): Promise<void> {
    if (!respond) return
    await respond({ response_type: 'ephemeral', text, ...(blocks ? { blocks } : {}) })
  }

  private async respondInChannel(respond: SlackRespond, text: string): Promise<void> {
    if (!respond) return
    await respond({ response_type: 'in_channel', text })
  }

  private async addAckReaction(
    msg: Pick<SlackInboundMessage, 'channel' | 'ts'>,
    client: ManagedClient,
    reactionName: string | null,
  ): Promise<void> {
    if (!reactionName) return
    try {
      await client.react({ channel: msg.channel, timestamp: msg.ts, name: reactionName })
    } catch {
      // best effort only
    }
  }

  private async addProcessingReaction(
    msg: Pick<SlackInboundMessage, 'channel' | 'ts'>,
    client: ManagedClient,
    reactionName: string | null,
  ): Promise<void> {
    if (!reactionName) return
    try {
      await client.react({
        channel: msg.channel,
        timestamp: msg.ts,
        name: reactionName,
      })
    } catch {
      // best effort only
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  private decryptSecrets(encrypted: string): Record<string, string> {
    return decryptChannelSecrets(encrypted, this.encryptionKey)
  }

  getStats(): {
    clients: number
    channels: number
    clientDetails: Array<{
      tokenHash: string
      channels: number
      botUserId: string | null
      botName: string | null
      teamId: string | null
      connected: boolean
      lastStartAt: string | null
      lastError: string | null
    }>
  } {
    const clientDetails = Array.from(this.clients.values()).map((c) => ({
      tokenHash: `${c.tokenHash.slice(0, 8)}...`,
      channels: c.channels.size,
      botUserId: c.botUserId,
      botName: c.botName,
      teamId: c.teamId,
      connected: c.connected,
      lastStartAt: c.lastStartAt,
      lastError: c.lastError,
    }))

    return {
      clients: this.clients.size,
      channels: Array.from(this.clients.values()).reduce((sum, c) => sum + c.channels.size, 0),
      clientDetails,
    }
  }
}
