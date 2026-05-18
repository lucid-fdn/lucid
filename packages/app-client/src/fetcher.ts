import type { z } from 'zod'

import { LucidApiError } from './errors.js'

export type LucidAuthConfig =
  | {
      mode: 'cookie'
    }
  | {
      mode: 'bearer'
      token: string
    }
  | {
      mode: 'none'
    }

export type LucidFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type LucidRequestOptions = {
  baseUrl: string
  auth?: LucidAuthConfig
  fetch?: LucidFetch
  headers?: HeadersInit
}

export class LucidHttpClient {
  private readonly baseUrl: URL
  private readonly auth: LucidAuthConfig
  private readonly fetchImpl: LucidFetch
  private readonly headers: HeadersInit | undefined

  constructor(options: LucidRequestOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.auth = options.auth ?? { mode: 'cookie' }
    this.fetchImpl = options.fetch ?? fetch
    this.headers = options.headers
  }

  async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return this.request(path, schema, { method: 'GET' })
  }

  async post<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    return this.request(path, schema, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  async patch<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    return this.request(path, schema, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  async delete<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return this.request(path, schema, { method: 'DELETE' })
  }

  private async request<T>(path: string, schema: z.ZodType<T>, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(resolvePath(this.baseUrl, path), {
      ...init,
      credentials: this.auth.mode === 'cookie' ? 'include' : 'same-origin',
      headers: this.buildHeaders(init.headers),
    })

    const payload = await readJson(response)
    if (!response.ok) {
      const errorPayload = payload as { error?: string; code?: string } | null
      throw new LucidApiError(errorPayload?.error ?? `Lucid API request failed with ${response.status}`, {
        status: response.status,
        code: errorPayload?.code,
        body: payload,
      })
    }

    return schema.parse(payload)
  }

  private buildHeaders(headers?: HeadersInit): Headers {
    const merged = new Headers(this.headers)
    merged.set('Accept', 'application/json')

    if (!merged.has('Content-Type')) {
      merged.set('Content-Type', 'application/json')
    }

    if (this.auth.mode === 'bearer') {
      merged.set('Authorization', `Bearer ${this.auth.token}`)
    }

    new Headers(headers).forEach((value, key) => merged.set(key, value))
    return merged
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    throw new LucidApiError('Lucid API returned invalid JSON', {
      status: response.status,
      body: text,
    })
  }
}

function normalizeBaseUrl(baseUrl: string): URL {
  try {
    const url = new URL(baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }
    return url
  } catch {
    throw new TypeError(`Invalid Lucid API base URL: ${baseUrl}`)
  }
}

function resolvePath(baseUrl: URL, path: string): URL {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  return new URL(normalizedPath, baseUrl.href.endsWith('/') ? baseUrl : `${baseUrl.href}/`)
}
