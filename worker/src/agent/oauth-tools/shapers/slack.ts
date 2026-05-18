/**
 * Slack Response Shaper — compacts channels, users, and messages.
 */

import type { ShaperResult } from '../response-shaper.js'
import { compacted, passthrough, detectPagination } from '../response-shaper.js'

function compactSlackChannel(ch: Record<string, unknown>): Record<string, unknown> {
  return {
    id: ch.id,
    name: ch.name,
    topic: (ch.topic as Record<string, unknown>)?.value ?? null,
    purpose: (ch.purpose as Record<string, unknown>)?.value ?? null,
    num_members: ch.num_members ?? null,
    is_archived: ch.is_archived ?? false,
  }
}

function compactSlackUser(u: Record<string, unknown>): Record<string, unknown> {
  const profile = u.profile as Record<string, unknown> | undefined
  return {
    id: u.id,
    name: u.name,
    real_name: u.real_name ?? profile?.real_name ?? null,
    display_name: profile?.display_name ?? null,
    email: profile?.email ?? null,
    is_admin: u.is_admin ?? false,
    is_bot: u.is_bot ?? false,
  }
}

function compactSlackMessage(m: Record<string, unknown>): Record<string, unknown> {
  const compact: Record<string, unknown> = {
    ts: m.ts,
    user: m.user ?? null,
    text: m.text ?? '',
  }
  if (m.thread_ts) compact.thread_ts = m.thread_ts
  if (m.reply_count) compact.reply_count = m.reply_count
  if (m.reactions) compact.reactions = m.reactions
  return compact
}

const SLACK_CHANNEL_ACTIONS = new Set(['list-channels', 'get-channel-info', 'list-conversations'])
const SLACK_USER_ACTIONS = new Set(['list-users', 'find-user-by-email', 'get-user-info'])
const SLACK_MESSAGE_ACTIONS = new Set(['get-conversation-history', 'get-thread-replies', 'search-messages'])

export function shapeSlackResponse(actionName: string, result: unknown): ShaperResult {
  if (typeof result !== 'object' || result === null) return passthrough(result)
  const data = result as Record<string, unknown>

  if (SLACK_CHANNEL_ACTIONS.has(actionName)) {
    const channels = (data.channels ?? data.channel) as Record<string, unknown>[] | Record<string, unknown> | undefined
    if (Array.isArray(channels)) {
      const items = channels.map(compactSlackChannel)
      const pagination = detectPagination(data)
      return compacted(result, { results: items, _compact: true, ...pagination }, items.length)
    }
    if (channels && typeof channels === 'object') {
      return compacted(result, compactSlackChannel(channels), 1)
    }
  }

  if (SLACK_USER_ACTIONS.has(actionName)) {
    const members = (data.members ?? data.user) as Record<string, unknown>[] | Record<string, unknown> | undefined
    if (Array.isArray(members)) {
      const items = members.map(compactSlackUser)
      const pagination = detectPagination(data)
      return compacted(result, { results: items, _compact: true, ...pagination }, items.length)
    }
    if (members && typeof members === 'object') {
      return compacted(result, compactSlackUser(members), 1)
    }
  }

  if (SLACK_MESSAGE_ACTIONS.has(actionName)) {
    const messages = (data.messages ?? data.matches) as Record<string, unknown>[] | undefined
    if (Array.isArray(messages)) {
      const items = messages.map(compactSlackMessage)
      const pagination = detectPagination(data)
      return compacted(result, { results: items, _compact: true, ...pagination }, items.length)
    }
  }

  // Write actions and unknown — passthrough
  return passthrough(result)
}
