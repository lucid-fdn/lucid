import { LUCID_DESKTOP_PROTOCOL, normalizeLucidProtocol } from './platform.js'

export type LucidDeepLinkKind =
  | 'workspace'
  | 'project'
  | 'project-agent'
  | 'project-run'
  | 'workspace-approval'
  | 'agent-ops-run'
  | 'workspace-routine'
  | 'routine'

export type LucidDeepLink =
  | {
      kind: 'workspace'
      workspaceSlug: string
    }
  | {
      kind: 'project'
      workspaceSlug: string
      projectSlug: string
    }
  | {
      kind: 'project-agent'
      workspaceSlug: string
      projectSlug: string
      agentId: string
    }
  | {
      kind: 'project-run'
      workspaceSlug: string
      projectSlug: string
      runId: string
    }
  | {
      kind: 'workspace-approval'
      workspaceSlug: string
      approvalId: string
    }
  | {
      kind: 'agent-ops-run'
      workspaceSlug: string
      runId: string
    }
  | {
      kind: 'workspace-routine'
      workspaceSlug: string
      routineId: string
    }
  | {
      kind: 'routine'
      routineId: string
    }

export type LucidDeepLinkParseError =
  | 'invalid-url'
  | 'unsupported-protocol'
  | 'unsupported-route'
  | 'invalid-segment'

export type LucidDeepLinkParseResult =
  | {
      ok: true
      input: string
      segments: string[]
      link: LucidDeepLink
    }
  | {
      ok: false
      input: string
      error: LucidDeepLinkParseError
      reason: string
    }

export type LucidDeepLinkWebPathResult =
  | {
      ok: true
      path: string
      link: LucidDeepLink
    }
  | {
      ok: false
      link: LucidDeepLink
      error: 'workspace-required' | 'unsupported-route'
      reason: string
    }

export type LucidDeepLinkWebPathOptions = {
  defaultWorkspaceSlug?: string | null
}

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/

function decodeSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment)
    return SAFE_SEGMENT_PATTERN.test(decoded) ? decoded : null
  } catch {
    return null
  }
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment)
}

function segmentsFromUrl(url: URL): string[] | null {
  const host = decodeSegment(url.hostname)
  if (!host) return null

  const pathSegments = url.pathname
    .split('/')
    .filter(Boolean)
    .map(decodeSegment)

  if (pathSegments.some((segment) => segment === null)) return null
  return [host, ...(pathSegments as string[])]
}

function parseSegments(segments: string[]): LucidDeepLink | null {
  const [root, workspaceSlug, section, projectSlug, leaf, id, tail, tailId] = segments

  if (root === 'workspace') {
    if (segments.length === 2) {
      return { kind: 'workspace', workspaceSlug }
    }

    if (section === 'projects' && projectSlug) {
      if (segments.length === 4) {
        return { kind: 'project', workspaceSlug, projectSlug }
      }

      if (leaf === 'agents' && id && segments.length === 6) {
        return { kind: 'project-agent', workspaceSlug, projectSlug, agentId: id }
      }

      if (leaf === 'runs' && id && segments.length === 6) {
        return { kind: 'project-run', workspaceSlug, projectSlug, runId: id }
      }
    }

    if (section === 'approvals' && projectSlug && segments.length === 4) {
      return { kind: 'workspace-approval', workspaceSlug, approvalId: projectSlug }
    }

    if (section === 'mission-control' && projectSlug === 'agent-ops' && leaf === 'runs' && id && segments.length === 6) {
      return { kind: 'agent-ops-run', workspaceSlug, runId: id }
    }

    if (section === 'mission-control' && projectSlug === 'routines' && leaf && segments.length === 5) {
      return { kind: 'workspace-routine', workspaceSlug, routineId: leaf }
    }

    if (section === 'mission-control' && projectSlug === 'routines' && leaf === 'runs' && id && tail === undefined && tailId === undefined) {
      return { kind: 'workspace-routine', workspaceSlug, routineId: id }
    }
  }

  if (root === 'routines' && workspaceSlug && segments.length === 2) {
    return { kind: 'routine', routineId: workspaceSlug }
  }

  return null
}

export function isLucidDeepLink(input: string, protocol = LUCID_DESKTOP_PROTOCOL): boolean {
  try {
    const url = new URL(input)
    return url.protocol === `${normalizeLucidProtocol(protocol)}:`
  } catch {
    return false
  }
}

export function parseLucidDeepLink(input: string, protocol = LUCID_DESKTOP_PROTOCOL): LucidDeepLinkParseResult {
  let url: URL

  try {
    url = new URL(input)
  } catch {
    return {
      ok: false,
      input,
      error: 'invalid-url',
      reason: 'Deep link must be an absolute lucid:// URL.',
    }
  }

  if (url.protocol !== `${normalizeLucidProtocol(protocol)}:`) {
    return {
      ok: false,
      input,
      error: 'unsupported-protocol',
      reason: `Expected ${normalizeLucidProtocol(protocol)}:// deep link.`,
    }
  }

  const segments = segmentsFromUrl(url)
  if (!segments) {
    return {
      ok: false,
      input,
      error: 'invalid-segment',
      reason: 'Deep link contains an invalid path segment.',
    }
  }

  const link = parseSegments(segments)
  if (!link) {
    return {
      ok: false,
      input,
      error: 'unsupported-route',
      reason: 'Deep link route is not supported by Lucid native clients yet.',
    }
  }

  return { ok: true, input, segments, link }
}

export function resolveLucidDeepLinkToWebPath(
  link: LucidDeepLink,
  options: LucidDeepLinkWebPathOptions = {},
): LucidDeepLinkWebPathResult {
  switch (link.kind) {
    case 'workspace':
      return {
        ok: true,
        link,
        path: `/${encodePathSegment(link.workspaceSlug)}/dashboard`,
      }
    case 'project':
      return {
        ok: true,
        link,
        path: `/${encodePathSegment(link.workspaceSlug)}/projects/${encodePathSegment(link.projectSlug)}`,
      }
    case 'project-agent':
      return {
        ok: true,
        link,
        path: `/${encodePathSegment(link.workspaceSlug)}/projects/${encodePathSegment(link.projectSlug)}/agents/${encodePathSegment(link.agentId)}`,
      }
    case 'project-run':
      return {
        ok: true,
        link,
        path: `/${encodePathSegment(link.workspaceSlug)}/projects/${encodePathSegment(link.projectSlug)}/runs?run=${encodeURIComponent(link.runId)}`,
      }
    case 'workspace-approval':
      return {
        ok: true,
        link,
        path: `/${encodePathSegment(link.workspaceSlug)}/inbox?approval=${encodeURIComponent(link.approvalId)}`,
      }
    case 'agent-ops-run':
      return {
        ok: true,
        link,
        path: `/${encodePathSegment(link.workspaceSlug)}/mission-control/agent-ops?run=${encodeURIComponent(link.runId)}`,
      }
    case 'workspace-routine':
      return {
        ok: true,
        link,
        path: `/${encodePathSegment(link.workspaceSlug)}/mission-control/routines/${encodePathSegment(link.routineId)}`,
      }
    case 'routine': {
      const workspaceSlug = options.defaultWorkspaceSlug?.trim()
      if (!workspaceSlug) {
        return {
          ok: false,
          link,
          error: 'workspace-required',
          reason: 'Routine deep links need a workspace slug to resolve to a web route.',
        }
      }

      return {
        ok: true,
        link,
        path: `/${encodePathSegment(workspaceSlug)}/mission-control/routines/${encodePathSegment(link.routineId)}`,
      }
    }
    default:
      return {
        ok: false,
        link,
        error: 'unsupported-route',
        reason: 'Unsupported Lucid deep-link route.',
      }
  }
}

export function parseLucidDeepLinkToWebPath(
  input: string,
  options: LucidDeepLinkWebPathOptions & { protocol?: string } = {},
): LucidDeepLinkParseResult | LucidDeepLinkWebPathResult {
  const parsed = parseLucidDeepLink(input, options.protocol)
  if (!parsed.ok) return parsed
  return resolveLucidDeepLinkToWebPath(parsed.link, options)
}
