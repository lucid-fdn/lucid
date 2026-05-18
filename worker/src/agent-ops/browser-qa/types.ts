export type BrowserQaProviderKind =
  | 'lucid-managed'
  | 'steel'
  | 'playwright'
  | 'browserless'
  | 'stagehand'
  | 'openclaw-compatible'
  | 'hermes'
  | 'remote-cdp'

export type BrowserQaProviderHealth = {
  ok: boolean
  provider: BrowserQaProviderKind
  message?: string
}

export type BrowserQaProviderConfig = {
  kind: BrowserQaProviderKind
  baseUrl: string
  token?: string
  password?: string
  profile?: string
  timeoutMs: number
}

export type BrowserQaExecutionInput = {
  targetUrl: string
  runId: string
  stepId: string
  workflowId?: string | null
  orgId?: string | null
  scenario?: string | null
  browserAccountId?: string | null
  accountProvider?: BrowserQaProviderKind | null
  providerSessionRef?: string | null
  providerProfileRef?: string | null
  providerContextRef?: string | null
}

export type BrowserQaSession = {
  id: string
  provider: BrowserQaProviderKind
  targetUrl: string
  finalUrl?: string
  targetId?: string
  startedAt: string
  expiresAt?: string
}

export type BrowserQaSessionInput = BrowserQaExecutionInput & {
  sessionId: string
  targetId?: string
}

export type BrowserQaNavigateInput = BrowserQaSessionInput

export type BrowserQaNavigationResult = {
  finalUrl?: string
  targetId?: string
}

export type BrowserQaWaitInput = BrowserQaSessionInput

export type BrowserQaScreenshotInput = BrowserQaSessionInput & {
  fullPage?: boolean
}

export type BrowserQaActionInput = BrowserQaSessionInput & {
  instruction: string
}

export type BrowserQaActionResult = {
  ok: boolean
  message?: string
  targetId?: string
  finalUrl?: string
}

export type BrowserQaArtifact = {
  uri?: string
  path?: string
  url?: string
  contentType?: string
  byteLength?: number
  content?: Record<string, unknown>
  error?: string
}

export type BrowserQaSnapshot = {
  url?: string
  snapshot?: string
  truncated?: boolean
  stats?: Record<string, unknown>
  content?: Record<string, unknown>
  error?: string
}

export type BrowserQaEvidenceCollection = {
  consoleWarnings?: { messages?: unknown[]; error?: string }
  pageErrors?: { errors?: unknown[]; error?: string }
  networkRequests?: { requests?: unknown[]; error?: string }
  performance?: { result?: unknown; error?: string }
  trace?: BrowserQaArtifact
}

export interface BrowserQaProvider {
  readonly kind: BrowserQaProviderKind
  healthcheck(): Promise<BrowserQaProviderHealth>
  startSession(input: BrowserQaExecutionInput): Promise<BrowserQaSession>
  navigate(input: BrowserQaNavigateInput): Promise<BrowserQaNavigationResult>
  waitForReady(input: BrowserQaWaitInput): Promise<void>
  snapshot(input: BrowserQaSessionInput): Promise<BrowserQaSnapshot>
  screenshot(input: BrowserQaScreenshotInput): Promise<BrowserQaArtifact>
  collectEvidence(input: BrowserQaSessionInput): Promise<BrowserQaEvidenceCollection>
  act?(input: BrowserQaActionInput): Promise<BrowserQaActionResult>
  closeSession?(input: BrowserQaSessionInput): Promise<void>
}
