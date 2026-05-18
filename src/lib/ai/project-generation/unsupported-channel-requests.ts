import { CHANNEL_METADATA, CHANNEL_TYPES } from '@/lib/channels/types'

import type { GenerationDraft } from './schemas'

interface CapabilityLookup {
  skills?: Array<{ slug: string; name: string; description?: string | null }>
  plugins?: Array<{ slug: string; name: string; description?: string | null }>
  toolServers?: Array<{ name: string; description?: string | null }>
}

export interface UnsupportedChannelRequest {
  id: string
  label: string
  warning: string
  systemNote: string
}

const MESSAGE_SURFACE_PATTERNS = [
  /\b(?:answer|reply(?:\s+to)?|respond(?:\s+to)?|monitor|watch|triage|handle|send|read|manage)\b[^.!?\n]{0,120}?\b(?:dm|dms|direct messages?|messages?)\s+(?:on|in|via|from|through)\s+([a-z][\w .-]{0,48})/giu,
  /\b(?:dm|dms|direct messages?|messages?)\s+(?:on|in|via|from|through)\s+([a-z][\w .-]{0,48})/giu,
  /\b([a-z][\w .-]{1,48})\s+(?:dm|dms|direct messages?)\b/giu,
  /\b(?:answer|reply(?:\s+to)?|respond(?:\s+to)?|monitor|watch|triage|handle|send|read|manage)\s+([a-z][\w .-]{1,48})\s+messages\b/giu,
]

const SUPPORTED_CHANNEL_ALIASES = new Map<string, string>(
  CHANNEL_TYPES.flatMap((type) => {
    const metadata = CHANNEL_METADATA[type]
    return [
      [normalizeSurface(type), metadata.name],
      [normalizeSurface(metadata.name), metadata.name],
    ] as Array<[string, string]>
  }),
)

SUPPORTED_CHANNEL_ALIASES.set('teams', CHANNEL_METADATA.msteams.name)
SUPPORTED_CHANNEL_ALIASES.set('microsoft teams', CHANNEL_METADATA.msteams.name)

export function detectUnsupportedChannelRequests(
  prompt: string,
  capabilities?: CapabilityLookup,
): UnsupportedChannelRequest[] {
  const requestedSurfaces = extractRequestedMessageSurfaces(prompt)
  const unsupported = requestedSurfaces.filter((surface) => !isSupportedSurface(surface, capabilities))

  return unsupported.map((surface) => {
    const label = toDisplayLabel(surface)
    const warning = `Unsupported channel: ${label} is not available as a built-in Lucid channel or selected capability yet. Choose a supported channel, add a matching capability if available, or connect it through a custom integration before relying on this automation.`
    return {
      id: normalizeSurface(surface),
      label,
      warning,
      systemNote: `Channel limitation: ${label} is not available as a built-in Lucid channel or selected capability yet. Do not claim the agent can monitor or answer it until the user connects a supported channel or custom integration.`,
    }
  })
}

export function applyUnsupportedChannelNotes(
  draft: GenerationDraft,
  prompt: string,
  capabilities?: CapabilityLookup,
): { draft: GenerationDraft; warnings: string[] } {
  const requests = detectUnsupportedChannelRequests(prompt, capabilities)
  if (requests.length === 0) {
    return { draft, warnings: [] }
  }

  const nextDraft = structuredClone(draft) as GenerationDraft
  const warnings = requests.map((request) => request.warning)
  const systemNote = requests.map((request) => request.systemNote).join('\n')

  if (nextDraft.agent) {
    nextDraft.agent.system_prompt = appendNoteOnce(nextDraft.agent.system_prompt, systemNote)
  }

  if (nextDraft.team) {
    nextDraft.team.objective = appendNoteOnce(nextDraft.team.objective ?? '', systemNote)
    nextDraft.team.members = nextDraft.team.members.map((member) => ({
      ...member,
      system_prompt: appendNoteOnce(member.system_prompt, systemNote),
    }))
  }

  return { draft: nextDraft, warnings }
}

export function getUserFacingBuilderWarning(warnings: string[]): string | undefined {
  return warnings.find((warning) => warning.startsWith('Unsupported channel:'))
}

function extractRequestedMessageSurfaces(prompt: string): string[] {
  const surfaces = new Map<string, string>()

  for (const pattern of MESSAGE_SURFACE_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of prompt.matchAll(pattern)) {
      const surface = cleanSurfaceCandidate(match[1] ?? '')
      if (!surface) continue
      surfaces.set(normalizeSurface(surface), surface)
    }
  }

  return Array.from(surfaces.values())
}

function isSupportedSurface(surface: string, capabilities?: CapabilityLookup): boolean {
  const normalized = normalizeSurface(surface)
  if (!normalized) return true
  if (SUPPORTED_CHANNEL_ALIASES.has(normalized)) return true

  const haystacks = [
    ...(capabilities?.skills ?? []).flatMap((skill) => [skill.slug, skill.name, skill.description ?? '']),
    ...(capabilities?.plugins ?? []).flatMap((plugin) => [plugin.slug, plugin.name, plugin.description ?? '']),
    ...(capabilities?.toolServers ?? []).flatMap((server) => [server.name, server.description ?? '']),
  ]

  return haystacks.some((value) => {
    const capability = normalizeSurface(value)
    return Boolean(capability && (capability === normalized || capability.includes(normalized)))
  })
}

function cleanSurfaceCandidate(value: string): string {
  const cleaned = value
    .replace(/^(?:answer|reply(?:\s+to)?|respond(?:\s+to)?|monitor|watch|triage|handle|send|read|manage)\s+/iu, '')
    .replace(/^(?:to|on|in|via|from|through)\s+/iu, '')
    .replace(/\b(?:for me|for us|please|efficiently|automatically|asap)\b.*$/iu, '')
    .replace(/\b(?:and|or|with|while|that|to|so)\b.*$/iu, '')
    .replace(/^[\s"'`([{]+|[\s"'`)\]},.?!]+$/gu, '')
    .trim()

  return isValidSurfaceCandidate(cleaned) ? cleaned : ''
}

function isValidSurfaceCandidate(value: string): boolean {
  const normalized = normalizeSurface(value)
  if (!normalized) return false

  const blockedExact = new Set([
    'agent',
    'assistant',
    'task',
    'tasks',
    'message',
    'messages',
    'dm',
    'dms',
    'direct message',
    'direct messages',
    'answer',
    'reply',
    'respond',
    'monitor',
    'watch',
    'triage',
    'handle',
    'send',
    'read',
    'manage',
  ])
  if (blockedExact.has(normalized)) return false

  return !/\b(?:agent|assistant|task|tasks)\b/.test(normalized)
}

function normalizeSurface(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function toDisplayLabel(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.length <= 3 && part === part.toUpperCase()
      ? part
      : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function appendNoteOnce(value: string, note: string): string {
  const trimmed = value.trim()
  if (!note.trim() || trimmed.includes(note)) return trimmed
  return `${trimmed}\n\n${note}`.trim()
}
