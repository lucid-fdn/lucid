import type { BuilderCapabilityRegistry } from '@/lib/ai/capabilities/registry'
import { normalizeBuilderText } from './normalization'

export interface BuilderIntentProfile {
  id: 'personal-agent' | 'executive-assistant' | 'research-agent' | 'sales-agent' | 'support-agent'
  label: string
  description: string
  archetype: 'personal' | 'executive' | 'research' | 'sales' | 'support'
  keywords: string[]
  suggestedIntegrations: string[]
  capabilityKeywords: string[]
  templateKeywords: string[]
  followUpQuestion: string
}

const PROFILES: BuilderIntentProfile[] = [
  {
    id: 'personal-agent',
    label: 'Personal agent',
    description: 'A daily operator that helps with personal organization, reminders, inbox triage, and planning.',
    archetype: 'personal',
    keywords: ['personal agent', 'personal assistant', 'daily assistant', 'my assistant', 'life admin'],
    suggestedIntegrations: ['email', 'calendar', 'tasks', 'notes'],
    capabilityKeywords: ['email', 'gmail', 'calendar', 'google calendar', 'task', 'todo', 'reminder', 'note', 'notion'],
    templateKeywords: ['assistant', 'personal', 'productivity', 'organizer'],
    followUpQuestion: 'Should it lean more into email, calendar planning, or task execution?',
  },
  {
    id: 'executive-assistant',
    label: 'Executive assistant',
    description: 'An executive operating partner that handles scheduling, briefing, follow-ups, and decision support.',
    archetype: 'executive',
    keywords: ['ceo assistant', 'executive assistant', 'founder assistant', 'chief of staff', 'ceo daily assistant'],
    suggestedIntegrations: ['email', 'calendar', 'tasks', 'briefings'],
    capabilityKeywords: ['email', 'gmail', 'calendar', 'google calendar', 'task', 'reminder', 'brief', 'notion', 'slack'],
    templateKeywords: ['executive', 'ceo', 'chief', 'assistant', 'briefing'],
    followUpQuestion: 'Should it focus more on calendar management, email handling, or strategic briefings?',
  },
  {
    id: 'research-agent',
    label: 'Research agent',
    description: 'A researcher that gathers information, synthesizes findings, and tracks developments over time.',
    archetype: 'research',
    keywords: ['research agent', 'research assistant', 'analyst', 'monitor', 'monitoring'],
    suggestedIntegrations: ['web research', 'notes', 'reports'],
    capabilityKeywords: ['research', 'search', 'web', 'monitor', 'report', 'note', 'notion'],
    templateKeywords: ['research', 'monitor', 'analysis', 'insight'],
    followUpQuestion: 'Should it focus more on monitoring, synthesis, or reporting?',
  },
  {
    id: 'sales-agent',
    label: 'Sales agent',
    description: 'A pipeline operator for outreach, follow-up, lead qualification, and CRM hygiene.',
    archetype: 'sales',
    keywords: ['sales agent', 'sales assistant', 'prospecting', 'outreach', 'lead gen', 'crm'],
    suggestedIntegrations: ['email', 'crm', 'calendar'],
    capabilityKeywords: ['sales', 'crm', 'hubspot', 'salesforce', 'email', 'calendar', 'lead', 'outreach'],
    templateKeywords: ['sales', 'prospect', 'follow-up', 'crm'],
    followUpQuestion: 'Should it optimize more for outreach, follow-up, or pipeline hygiene?',
  },
  {
    id: 'support-agent',
    label: 'Support agent',
    description: 'A support operator that triages requests, answers product questions, and escalates when needed.',
    archetype: 'support',
    keywords: ['support agent', 'support assistant', 'customer support', 'helpdesk', 'customer success'],
    suggestedIntegrations: ['knowledge base', 'ticketing', 'chat'],
    capabilityKeywords: ['support', 'ticket', 'zendesk', 'intercom', 'chat', 'knowledge', 'faq'],
    templateKeywords: ['support', 'helpdesk', 'faq', 'ticket'],
    followUpQuestion: 'Should it prioritize fast triage, deeper troubleshooting, or escalation handling?',
  },
]

export function detectBuilderIntentProfile(prompt: string): BuilderIntentProfile | null {
  const normalized = normalizeBuilderText(prompt).toLowerCase()

  const scored = PROFILES
    .map((profile) => ({
      profile,
      score: profile.keywords.reduce((total, keyword) => (
        normalized.includes(keyword) ? total + Math.max(3, keyword.split(/\s+/).length) : total
      ), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  if (scored[0]?.profile) {
    return scored[0].profile
  }

  return inferGenericAssistantProfile(normalized)
}

export function summarizeBuilderIntentProfile(profile: BuilderIntentProfile | null): string | null {
  if (!profile) return null
  return [
    `${profile.label}: ${profile.description}`,
    `Strong default bundle: ${profile.suggestedIntegrations.join(', ')}.`,
  ].join(' ')
}

export function recommendProfileCapabilities(input: {
  profile: BuilderIntentProfile | null
  registry: BuilderCapabilityRegistry
  selectedSkillSlugs?: string[]
  selectedPluginSlugs?: string[]
  selectedToolServerNames?: string[]
}) {
  if (!input.profile) {
    return {
      skills: [],
      plugins: [],
      tool_servers: [],
    }
  }

  const selectedSkills = new Set(input.selectedSkillSlugs ?? [])
  const selectedPlugins = new Set(input.selectedPluginSlugs ?? [])
  const selectedServers = new Set(input.selectedToolServerNames ?? [])
  const wantedTerms = new Set(input.profile.capabilityKeywords.map((term) => term.toLowerCase()))

  const matches = (...values: Array<string | null | undefined>) => values.some((value) => {
    const lower = value?.toLowerCase()
    return Boolean(lower && [...wantedTerms].some((term) => lower.includes(term)))
  })

  return {
    skills: input.registry.skills
      .filter((skill) => !selectedSkills.has(skill.slug))
      .filter((skill) => matches(skill.slug, skill.name, skill.description))
      .slice(0, 4)
      .map((skill) => ({
        slug: skill.slug,
        name: skill.name,
        source: skill.source,
      })),
    plugins: input.registry.plugins
      .filter((plugin) => !selectedPlugins.has(plugin.slug))
      .filter((plugin) => matches(plugin.slug, plugin.name, plugin.description, ...(plugin.toolNames ?? [])))
      .slice(0, 4)
      .map((plugin) => ({
        slug: plugin.slug,
        name: plugin.name,
        installed: plugin.installed,
        ...(plugin.iconUrl ? { icon_url: plugin.iconUrl } : {}),
      })),
    tool_servers: input.registry.toolServers
      .filter((server) => !selectedServers.has(server.name))
      .filter((server) => matches(server.name, server.description, server.url))
      .slice(0, 3)
      .map((server) => ({
        name: server.name,
        transport: server.transport,
        url: server.url,
        source: server.source,
      })),
  }
}

export function scoreTemplateKeywords(profile: BuilderIntentProfile | null, text: string): number {
  if (!profile) return 0
  const lower = text.toLowerCase()
  return profile.templateKeywords.reduce((score, keyword) => (
    lower.includes(keyword) ? score + 1 : score
  ), 0)
}

function inferGenericAssistantProfile(normalizedPrompt: string): BuilderIntentProfile | null {
  const hasAssistantLikeIntent = /\b(assistant|agent)\b/.test(normalizedPrompt)
  if (!hasAssistantLikeIntent) return null

  if (/\b(sales|support|research|monitor|helpdesk|crm|prospect|lead|customer|ceo|executive|founder|chief)\b/.test(normalizedPrompt)) {
    return null
  }

  return PROFILES.find((profile) => profile.id === 'personal-agent') ?? null
}
