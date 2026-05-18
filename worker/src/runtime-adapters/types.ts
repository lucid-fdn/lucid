export interface RuntimeAdapterReadiness {
  ready: boolean
  required: boolean
  status: 'ready' | 'skipped' | 'unavailable'
  error?: string | null
  details?: Array<{
    adapter: string
    ready: boolean
    required: boolean
    status: 'ready' | 'skipped' | 'unavailable'
    error?: string | null
  }>
}

export interface EngineRuntimeAdapter {
  readonly id: string
  verifyInstalled(): Promise<void>
  checkReadiness(): Promise<RuntimeAdapterReadiness>
}
