/**
 * SlashCommandRouter — Parses and handles user-facing slash commands.
 *
 * Commands are intercepted BEFORE the agent/LLM pipeline in processInboundEvent().
 * If a message starts with a recognized command, the router handles it directly
 * and returns a response — skipping the LLM entirely.
 *
 * Supported commands (Phase 2 gate — minimal versions):
 *   /reset   — Clear conversation history
 *   /status  — Return assistant info + stats
 *   /help    — List available commands
 *   /usage   — Token usage summary
 *   /compact — Force conversation compaction
 *
 * See docs/OPENCLAW_AUDIT_PLAN_V3.md P1 #12
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface SlashCommandContext {
  supabase: SupabaseClient
  assistantId: string
  assistantName: string
  conversationId: string
  channelId: string
  tenantKey: string
  model: string
}

export interface SlashCommandResult {
  handled: boolean
  response?: string
}

/** All registered commands */
const COMMANDS: Record<string, {
  description: string
  handler: (ctx: SlashCommandContext, args: string) => Promise<string>
}> = {
  '/whoami': {
    description: 'Show the active assistant for this conversation',
    handler: handleStatus,
  },
  '/agent': {
    description: 'Show the active assistant for this conversation',
    handler: handleStatus,
  },
  '/help': {
    description: 'List available commands',
    handler: handleHelp,
  },
  '/reset': {
    description: 'Clear conversation history',
    handler: handleReset,
  },
  '/status': {
    description: 'Show assistant info and status',
    handler: handleStatus,
  },
  '/usage': {
    description: 'Show token usage summary',
    handler: handleUsage,
  },
  '/compact': {
    description: 'Force conversation compaction',
    handler: handleCompact,
  },
}

/**
 * Try to parse and handle a slash command.
 * Returns { handled: true, response } if the message was a command.
 * Returns { handled: false } if it's a normal message.
 */
export async function routeSlashCommand(
  messageText: string,
  ctx: SlashCommandContext
): Promise<SlashCommandResult> {
  const trimmed = messageText.trim()
  if (!trimmed.startsWith('/')) return { handled: false }

  const spaceIdx = trimmed.indexOf(' ')
  const command = (spaceIdx === -1 ? trimmed : trimmed.substring(0, spaceIdx)).toLowerCase()
  const args = spaceIdx === -1 ? '' : trimmed.substring(spaceIdx + 1).trim()

  const handler = COMMANDS[command]
  if (!handler) return { handled: false } // Unknown command — pass through to LLM

  try {
    const response = await handler.handler(ctx, args)
    return { handled: true, response }
  } catch (err) {
    console.warn(`[commands] Error handling ${command}:`, err)
    return { handled: true, response: `⚠️ Error executing ${command}. Please try again.` }
  }
}

export function isSlashCommand(messageText: string): boolean {
  const trimmed = messageText.trim()
  if (!trimmed.startsWith('/')) return false
  return trimmed.split(' ')[0].toLowerCase() in COMMANDS
}

// ─── Command Handlers ───

async function handleHelp(_ctx: SlashCommandContext, _args: string): Promise<string> {
  const lines = ['📋 **Available Commands:**', '']
  for (const [cmd, def] of Object.entries(COMMANDS)) {
    lines.push(`  \`${cmd}\` — ${def.description}`)
  }
  lines.push('', '_Send any other message to chat with the assistant._')
  return lines.join('\n')
}

async function handleReset(ctx: SlashCommandContext, _args: string): Promise<string> {
  const { error } = await ctx.supabase
    .from('assistant_messages')
    .delete()
    .eq('conversation_id', ctx.conversationId)
  if (error) {
    console.warn(`[commands] /reset error: ${error.message}`)
    return '⚠️ Failed to clear conversation history. Please try again.'
  }
  return '🔄 Conversation reset. All messages cleared. You can start fresh!'
}

async function handleStatus(ctx: SlashCommandContext, _args: string): Promise<string> {
  const { count: msgCount } = await ctx.supabase
    .from('assistant_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', ctx.conversationId)
  return [
    '📊 **Assistant Status:**', '',
    `  **Name:** ${ctx.assistantName}`,
    `  **Model:** ${ctx.model}`,
    `  **Messages in conversation:** ${msgCount ?? 0}`,
    `  **Tenant:** ${ctx.tenantKey}`,
  ].join('\n')
}

async function handleUsage(ctx: SlashCommandContext, _args: string): Promise<string> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: usageRows, error } = await ctx.supabase
    .from('assistant_usage_records')
    .select('prompt_tokens, completion_tokens, total_tokens, llm_calls, tool_calls')
    .eq('assistant_id', ctx.assistantId)
    .gte('created_at', since)
  if (error || !usageRows) return '⚠️ Unable to fetch usage data.'
  const t = usageRows.reduce(
    (a, r) => ({
      pt: a.pt + (r.prompt_tokens || 0), ct: a.ct + (r.completion_tokens || 0),
      tt: a.tt + (r.total_tokens || 0), lc: a.lc + (r.llm_calls || 0), tc: a.tc + (r.tool_calls || 0),
    }), { pt: 0, ct: 0, tt: 0, lc: 0, tc: 0 })
  return [
    '📈 **Usage (last 24h):**', '',
    `  **Total tokens:** ${t.tt.toLocaleString()}`,
    `  **Prompt tokens:** ${t.pt.toLocaleString()}`,
    `  **Completion tokens:** ${t.ct.toLocaleString()}`,
    `  **LLM calls:** ${t.lc}`, `  **Tool calls:** ${t.tc}`, `  **Requests:** ${usageRows.length}`,
  ].join('\n')
}

async function handleCompact(ctx: SlashCommandContext, _args: string): Promise<string> {
  const { count } = await ctx.supabase
    .from('assistant_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', ctx.conversationId)
  if (!count || count < 10) return `ℹ️ Conversation has ${count ?? 0} messages — no compaction needed (minimum 10).`
  const { error } = await ctx.supabase
    .from('conversation_summaries')
    .upsert({ conversation_id: ctx.conversationId, force_compact: true, updated_at: new Date().toISOString() }, { onConflict: 'conversation_id' })
  if (error) return '⚠️ Failed to request compaction.'
  return `🗜️ Compaction requested for ${count} messages. It will run on the next message.`
}
