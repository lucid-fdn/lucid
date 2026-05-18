export interface SandboxValidationFile {
  path: string
  content: string
}

export interface SandboxValidationRequest {
  files: SandboxValidationFile[]
  commands: Array<{ cmd: string; args: string[]; cwd?: string }>
  env?: Record<string, string>
  networkPolicy?: unknown
}

export interface SandboxValidationResult {
  provider: 'vercel_sandbox' | 'mock'
  passed: boolean
  logs: string[]
  metadata?: Record<string, unknown>
}

export interface SandboxProvider {
  readonly id: SandboxValidationResult['provider']
  validate(request: SandboxValidationRequest): Promise<SandboxValidationResult>
}
