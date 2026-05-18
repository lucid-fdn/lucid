import type { ChannelHint } from '@contracts/template'

export interface ScheduleTaskDraftContext {
  projectName?: string | null
  projectDescription?: string | null
  agentName?: string | null
  systemPrompt?: string | null
  skills?: string[]
  plugins?: string[]
  channelHints?: ChannelHint[]
}

export interface ScheduleTaskDraftSeed {
  name: string
  description: string
  prompt: string
  cron: string
}

function tokenize(values: Array<string | null | undefined>): string[] {
  return values
    .flatMap((value) => (value ?? '').toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean)
}

function hasAny(tokens: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => tokens.has(candidate))
}

function getPrimaryAgentLabel(context: ScheduleTaskDraftContext) {
  return context.agentName?.trim()
    || context.projectName?.trim()
    || 'this agent'
}

function buildGenericSeed(context: ScheduleTaskDraftContext): ScheduleTaskDraftSeed {
  const label = getPrimaryAgentLabel(context)
  return {
    name: 'Scheduled review',
    description: 'Recurring agent review',
    prompt: `Run your scheduled review for ${label}. Use the agent's configured instructions and connected tools to perform its core job, then return a concise update with: what changed, what matters now, recommended next actions, and blockers. If nothing important changed, say so clearly.`,
    cron: '0 9 * * 1-5',
  }
}

export function buildScheduleTaskDraftSeed(context: ScheduleTaskDraftContext): ScheduleTaskDraftSeed {
  const channels = (context.channelHints ?? []).map((channel) => channel.channel_type)
  const tokens = new Set(tokenize([
    context.projectName,
    context.projectDescription,
    context.agentName,
    context.systemPrompt,
    ...(context.skills ?? []),
    ...(context.plugins ?? []),
    ...channels,
  ]))

  const isPersonalAssistant =
    hasAny(tokens, ['assistant', 'personal', 'calendar', 'email', 'task', 'tasks', 'reminder', 'notes'])
    && !hasAny(tokens, ['support', 'sales', 'brand', 'monitor', 'engineering', 'incident'])
  if (isPersonalAssistant) {
    return {
      name: 'Morning briefing',
      description: 'Weekday plan',
      prompt: 'Review today\'s calendar, urgent email, open tasks, and priority follow-ups. Return a concise morning briefing with: what matters now, schedule conflicts or timing risks, recommended next actions, and anything that can wait.',
      cron: '0 8 * * 1-5',
    }
  }

  if (hasAny(tokens, ['ceo', 'executive', 'brief', 'briefing', 'leadership'])) {
    return {
      name: 'Executive briefing',
      description: 'Recurring executive summary',
      prompt: 'Prepare a concise executive briefing. Review the highest-priority updates, risks, decisions, and follow-ups, then return a short report with: what changed, what needs attention today, recommended decisions, and unresolved blockers.',
      cron: '0 8 * * 1-5',
    }
  }

  if (hasAny(tokens, ['support', 'customer', 'ticket', 'tickets', 'helpdesk', 'triage'])) {
    return {
      name: 'Support triage',
      description: 'Recurring support queue review',
      prompt: 'Review new or updated support conversations and tickets. Identify urgent issues, repeated themes, and items that need escalation, then return a concise triage report with: urgent items, customer-impacting risks, recommended next actions, and anything safe to defer.',
      cron: '0 9 * * 1-5',
    }
  }

  if (hasAny(tokens, ['sales', 'prospect', 'pipeline', 'outreach', 'lead', 'leads'])) {
    return {
      name: 'Pipeline follow-up review',
      description: 'Recurring sales follow-up pass',
      prompt: 'Review active leads, pending follow-ups, and recent outreach activity. Return a concise pipeline update with: highest-priority opportunities, follow-ups due now, risks to pipeline momentum, and recommended next actions.',
      cron: '0 9 * * 1-5',
    }
  }

  if (hasAny(tokens, ['brand', 'monitor', 'watch', 'sentiment', 'mention', 'mentions', 'reputation'])) {
    return {
      name: 'Monitoring digest',
      description: 'Recurring monitoring report',
      prompt: 'Run a monitoring pass using the configured sources and tools. Identify meaningful new signals, classify what needs attention, and return a concise digest with: notable changes, risks, items worth amplifying, and recommended next actions.',
      cron: '0 8 * * *',
    }
  }

  if (hasAny(tokens, ['engineering', 'dev', 'incident', 'bug', 'github', 'linear', 'reliability'])) {
    return {
      name: 'Engineering digest',
      description: 'Recurring engineering review',
      prompt: 'Review the configured engineering work sources, identify urgent issues and safe follow-up work, and return a concise digest with: incidents or risks, items needing escalation, recommended next actions, and deferred work with reasons.',
      cron: '0 9 * * 1-5',
    }
  }

  if (hasAny(tokens, ['research', 'analysis', 'market', 'competitor', 'trend'])) {
    return {
      name: 'Research brief',
      description: 'Recurring research summary',
      prompt: 'Run the scheduled research pass on the configured topic or sources. Return a concise brief with: the most important new findings, why they matter, recommended follow-up actions, and open questions that still need evidence.',
      cron: '0 9 * * 1-5',
    }
  }

  return buildGenericSeed(context)
}
