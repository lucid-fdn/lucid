import {
  buildAgentOpsExternalHostInstallerManifest,
  hashAgentOpsExternalHostPackContent,
  type AgentOpsExternalHostId,
  type AgentOpsExternalHostInstallerArtifact,
  type AgentOpsExternalHostInstallerManifest,
} from './external-host-packs'

export interface AgentOpsExternalHostInstallPlan {
  hostId: AgentOpsExternalHostId
  label: string
  installTarget: string
  installPath: string
  rawUrl: string
  jsonUrl: string
  contentHash: string
  contentLength: number
  contentType: string
  dryRun: boolean
  overwrite: boolean
}

export interface AgentOpsExternalHostInstallPlanMatrix {
  plans: readonly AgentOpsExternalHostInstallPlan[]
  hostCount: number
  installTargets: readonly string[]
}

export interface AgentOpsExternalHostInstallContentVerification {
  valid: boolean
  errors: string[]
  actualHash: string
  actualLength: number
}

export type AgentOpsExternalHostInstallState = 'missing' | 'current' | 'stale'

export interface AgentOpsExternalHostInstalledState {
  state: AgentOpsExternalHostInstallState
  valid: boolean
  reason: string
  expectedHash: string
  actualHash: string | null
  expectedLength: number
  actualLength: number | null
}

export interface AgentOpsExternalHostInstalledStateSummary {
  total: number
  current: number
  missing: number
  stale: number
  valid: boolean
}

export function buildAgentOpsExternalHostInstallPlan(input: {
  hostId: AgentOpsExternalHostId
  targetRoot?: string
  baseUrl?: string
  manifest?: AgentOpsExternalHostInstallerManifest
  dryRun?: boolean
  overwrite?: boolean
}): AgentOpsExternalHostInstallPlan {
  const manifest = input.manifest ?? buildAgentOpsExternalHostInstallerManifest({ baseUrl: input.baseUrl })
  const artifact = selectAgentOpsExternalHostInstallerArtifact(manifest, input.hostId)
  const installTarget = validateAgentOpsExternalHostInstallTarget(artifact.installTarget)
  const targetRoot = normalizeInstallRoot(input.targetRoot ?? '.')

  return {
    hostId: artifact.hostId,
    label: artifact.label,
    installTarget,
    installPath: joinInstallPath(targetRoot, installTarget),
    rawUrl: artifact.rawUrl,
    jsonUrl: artifact.jsonUrl,
    contentHash: artifact.contentHash,
    contentLength: artifact.contentLength,
    contentType: artifact.contentType,
    dryRun: input.dryRun ?? true,
    overwrite: input.overwrite ?? false,
  }
}

export function buildAgentOpsExternalHostInstallPlanMatrix(input: {
  hostIds?: readonly AgentOpsExternalHostId[]
  targetRoot?: string
  baseUrl?: string
  manifest?: AgentOpsExternalHostInstallerManifest
  dryRun?: boolean
  overwrite?: boolean
} = {}): AgentOpsExternalHostInstallPlanMatrix {
  const manifest = input.manifest ?? buildAgentOpsExternalHostInstallerManifest({ baseUrl: input.baseUrl })
  const hostIds = input.hostIds ?? manifest.artifacts.map((artifact) => artifact.hostId)
  const plans = hostIds.map((hostId) => buildAgentOpsExternalHostInstallPlan({
    hostId,
    targetRoot: input.targetRoot,
    manifest,
    dryRun: input.dryRun,
    overwrite: input.overwrite,
  }))

  return {
    plans,
    hostCount: plans.length,
    installTargets: plans.map((plan) => plan.installTarget),
  }
}

export function selectAgentOpsExternalHostInstallerArtifact(
  manifest: AgentOpsExternalHostInstallerManifest,
  hostId: AgentOpsExternalHostId,
): AgentOpsExternalHostInstallerArtifact {
  const artifact = manifest.artifacts.find((candidate) => candidate.hostId === hostId)
  if (!artifact) {
    throw new Error(`No Agent Ops host-pack installer artifact found for ${hostId}.`)
  }
  return artifact
}

export function verifyAgentOpsExternalHostInstallContent(input: {
  artifact: Pick<AgentOpsExternalHostInstallerArtifact, 'contentHash' | 'contentLength'>
  content: string
}): AgentOpsExternalHostInstallContentVerification {
  const actualHash = hashAgentOpsExternalHostPackContent(input.content)
  const actualLength = new TextEncoder().encode(input.content).length
  const errors: string[] = []

  if (actualHash !== input.artifact.contentHash) {
    errors.push(`contentHash mismatch: expected ${input.artifact.contentHash}, got ${actualHash}`)
  }
  if (actualLength !== input.artifact.contentLength) {
    errors.push(`contentLength mismatch: expected ${input.artifact.contentLength}, got ${actualLength}`)
  }

  return {
    valid: errors.length === 0,
    errors,
    actualHash,
    actualLength,
  }
}

export function inspectAgentOpsExternalHostInstalledState(input: {
  artifact: Pick<AgentOpsExternalHostInstallerArtifact, 'contentHash' | 'contentLength'>
  existingContent: string | null
}): AgentOpsExternalHostInstalledState {
  if (input.existingContent === null) {
    return {
      state: 'missing',
      valid: false,
      reason: 'Host pack is not installed.',
      expectedHash: input.artifact.contentHash,
      actualHash: null,
      expectedLength: input.artifact.contentLength,
      actualLength: null,
    }
  }

  const verification = verifyAgentOpsExternalHostInstallContent({
    artifact: input.artifact,
    content: input.existingContent,
  })

  if (verification.valid) {
    return {
      state: 'current',
      valid: true,
      reason: 'Installed host pack matches the generated manifest.',
      expectedHash: input.artifact.contentHash,
      actualHash: verification.actualHash,
      expectedLength: input.artifact.contentLength,
      actualLength: verification.actualLength,
    }
  }

  return {
    state: 'stale',
    valid: false,
    reason: verification.errors.join('; '),
    expectedHash: input.artifact.contentHash,
    actualHash: verification.actualHash,
    expectedLength: input.artifact.contentLength,
    actualLength: verification.actualLength,
  }
}

export function summarizeAgentOpsExternalHostInstalledStates(
  states: readonly AgentOpsExternalHostInstalledState[],
): AgentOpsExternalHostInstalledStateSummary {
  const summary = states.reduce((acc, state) => {
    acc.total += 1
    acc[state.state] += 1
    return acc
  }, {
    total: 0,
    current: 0,
    missing: 0,
    stale: 0,
  })

  return {
    ...summary,
    valid: summary.total > 0 && summary.missing === 0 && summary.stale === 0,
  }
}

export function validateAgentOpsExternalHostInstallTarget(installTarget: string): string {
  const normalized = installTarget.trim().replace(/\\/g, '/')
  if (!normalized) {
    throw new Error('Agent Ops host-pack install target is empty.')
  }
  if (normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error(`Agent Ops host-pack install target must be relative: ${installTarget}`)
  }
  if (normalized.includes('\0')) {
    throw new Error('Agent Ops host-pack install target contains a null byte.')
  }

  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '..')) {
    throw new Error(`Agent Ops host-pack install target cannot traverse directories: ${installTarget}`)
  }
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error(`Agent Ops host-pack install target contains an empty segment: ${installTarget}`)
  }

  return normalized
}

function normalizeInstallRoot(root: string): string {
  const normalized = root.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized.length > 0 ? normalized : '.'
}

function joinInstallPath(root: string, installTarget: string): string {
  return root === '.' ? installTarget : `${root}/${installTarget}`
}
