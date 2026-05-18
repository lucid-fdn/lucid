export interface AppDeployRequest {
  appDeploymentId: string
  artifactId?: string
  target: 'lucid_hosted' | 'vercel' | 'netlify' | 'docker'
  environment?: 'preview' | 'production'
  providerProjectId?: string
  providerChatId?: string
  providerVersionId?: string
  metadata?: Record<string, unknown>
}

export interface AppDeployResult {
  provider: 'lucid' | 'v0' | 'vercel' | 'netlify' | 'docker'
  externalDeploymentId?: string
  url?: string
  status: 'queued' | 'building' | 'ready' | 'failed'
  metadata?: Record<string, unknown>
}

export interface AppDeployProvider {
  readonly id: AppDeployResult['provider']
  deploy(request: AppDeployRequest): Promise<AppDeployResult>
}
