import type { BrowserQaProviderConfig } from './types.js'

export class BrowserQaHttpClient {
  private readonly baseUrl: string
  private readonly token?: string
  private readonly password?: string
  private readonly profile?: string
  private readonly timeoutMs: number
  private readonly passwordHeader: string

  constructor(
    config: BrowserQaProviderConfig,
    options: { passwordHeader?: string } = {},
  ) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.token = config.token
    this.password = config.password
    this.profile = config.profile
    this.timeoutMs = config.timeoutMs
    this.passwordHeader = options.passwordHeader ?? 'x-browser-control-password'
  }

  async json<T = unknown>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE'
      query?: Record<string, string | undefined>
      body?: Record<string, unknown>
      timeoutMs?: number
    } = {},
  ): Promise<T> {
    const response = await this.request(path, options)
    return await response.json() as T
  }

  async request(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE'
      query?: Record<string, string | undefined>
      body?: Record<string, unknown>
      timeoutMs?: number
    } = {},
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(new Error('browser request timed out')),
      options.timeoutMs ?? this.timeoutMs,
    )

    try {
      const url = this.buildUrl(path, options.query)
      const headers = new Headers()
      if (options.body) headers.set('Content-Type', 'application/json')
      if (this.token) headers.set('Authorization', `Bearer ${this.token}`)
      if (this.password) headers.set(this.passwordHeader, this.password)

      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(body || `browser control HTTP ${response.status}`)
      }
      return response
    } finally {
      clearTimeout(timeout)
    }
  }

  buildUrl(path: string, query?: Record<string, string | undefined>): string {
    const url = new URL(path, `${this.baseUrl}/`)
    if (this.profile) url.searchParams.set('profile', this.profile)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value != null) url.searchParams.set(key, value)
    }
    return url.toString()
  }
}
