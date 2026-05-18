import type {
  BrowserQaArtifact,
  BrowserQaEvidenceCollection,
  BrowserQaExecutionInput,
  BrowserQaNavigateInput,
  BrowserQaNavigationResult,
  BrowserQaProvider,
  BrowserQaProviderHealth,
  BrowserQaProviderKind,
  BrowserQaScreenshotInput,
  BrowserQaSession,
  BrowserQaSessionInput,
  BrowserQaSnapshot,
} from '../types.js'

export class UnsupportedBrowserQaProvider implements BrowserQaProvider {
  constructor(
    readonly kind: BrowserQaProviderKind,
    private readonly reason: string,
  ) {}

  async healthcheck(): Promise<BrowserQaProviderHealth> {
    return { ok: false, provider: this.kind, message: this.reason }
  }

  async startSession(_input: BrowserQaExecutionInput): Promise<BrowserQaSession> {
    throw new Error(this.reason)
  }

  async navigate(_input: BrowserQaNavigateInput): Promise<BrowserQaNavigationResult> {
    throw new Error(this.reason)
  }

  async waitForReady(): Promise<void> {
    throw new Error(this.reason)
  }

  async snapshot(_input: BrowserQaSessionInput): Promise<BrowserQaSnapshot> {
    throw new Error(this.reason)
  }

  async screenshot(_input: BrowserQaScreenshotInput): Promise<BrowserQaArtifact> {
    throw new Error(this.reason)
  }

  async collectEvidence(_input: BrowserQaSessionInput): Promise<BrowserQaEvidenceCollection> {
    throw new Error(this.reason)
  }
}
