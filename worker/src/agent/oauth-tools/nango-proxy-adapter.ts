/**
 * Nango Proxy Adapter
 *
 * Provides the `nango` object that action scripts expect.
 * Delegates HTTP calls to the Nango SDK's proxy() method,
 * which handles auth header injection automatically.
 *
 * This replaces the orchestrator+runner pipeline for action execution.
 */

import { getNangoClient } from './nango-client.js'
import type { ProxyConfiguration } from '@nangohq/node'

/** Config shape that action scripts pass to HTTP methods. */
interface ActionProxyConfig {
  endpoint: string
  data?: unknown
  params?: Record<string, string | number | string[] | number[]>
  headers?: Record<string, string>
  retries?: number
  method?: string
  providerConfigKey?: string
  baseUrlOverride?: string
}

/** Error type that action scripts throw. */
export class ActionError extends Error {
  type = 'action_script_runtime_error'
  payload: Record<string, unknown>
  constructor(payload: Record<string, unknown>) {
    super((payload.message as string) || 'Action error')
    this.payload = payload
  }
}

/** The adapter object passed to action script `exec(nango, input)`. */
export interface NangoProxyAdapter {
  connectionId: string
  providerConfigKey: string
  proxy: (config: ActionProxyConfig) => Promise<{ data: unknown; status: number; headers: Record<string, string> }>
  get: (config: ActionProxyConfig) => Promise<{ data: unknown; status: number; headers: Record<string, string> }>
  post: (config: ActionProxyConfig) => Promise<{ data: unknown; status: number; headers: Record<string, string> }>
  put: (config: ActionProxyConfig) => Promise<{ data: unknown; status: number; headers: Record<string, string> }>
  patch: (config: ActionProxyConfig) => Promise<{ data: unknown; status: number; headers: Record<string, string> }>
  delete: (config: ActionProxyConfig) => Promise<{ data: unknown; status: number; headers: Record<string, string> }>
  getConnection: () => Promise<unknown>
  log: (msg: string, opts?: { level?: string }) => void
  ActionError: typeof ActionError
}

/**
 * Create an adapter that action scripts can use as their `nango` parameter.
 * Uses the Nango SDK's proxy() for all HTTP calls (handles auth injection).
 */
export function createNangoProxyAdapter(
  connectionId: string,
  providerConfigKey: string,
): NangoProxyAdapter {
  const nango = getNangoClient()
  if (!nango) throw new Error('Nango client not configured')

  function toSdkConfig(config: ActionProxyConfig): ProxyConfiguration {
    return {
      endpoint: config.endpoint,
      providerConfigKey: config.providerConfigKey || providerConfigKey,
      connectionId,
      ...(config.data !== undefined && { data: config.data }),
      ...(config.params !== undefined && { params: config.params }),
      ...(config.headers !== undefined && { headers: config.headers }),
      ...(config.retries !== undefined && { retries: config.retries }),
      ...(config.baseUrlOverride !== undefined && { baseUrlOverride: config.baseUrlOverride }),
    }
  }

  function toResult(resp: { data: unknown; status: number; headers: unknown }) {
    return {
      data: resp.data,
      status: resp.status,
      headers: (resp.headers ?? {}) as Record<string, string>,
    }
  }

  async function proxyCall(config: ActionProxyConfig) {
    const sdkConfig = toSdkConfig(config)
    const method = (config.method || 'GET').toUpperCase()
    let resp
    switch (method) {
      case 'POST': resp = await nango!.post(sdkConfig); break
      case 'PUT': resp = await nango!.put(sdkConfig); break
      case 'PATCH': resp = await nango!.patch(sdkConfig); break
      case 'DELETE': resp = await nango!.delete(sdkConfig); break
      default: resp = await nango!.get(sdkConfig); break
    }
    return toResult(resp)
  }

  return {
    connectionId,
    providerConfigKey,

    proxy: proxyCall,
    get: (config) => proxyCall({ ...config, method: 'GET' }),
    post: (config) => proxyCall({ ...config, method: 'POST' }),
    put: (config) => proxyCall({ ...config, method: 'PUT' }),
    patch: (config) => proxyCall({ ...config, method: 'PATCH' }),
    delete: (config) => proxyCall({ ...config, method: 'DELETE' }),

    async getConnection() {
      return nango.getConnection(providerConfigKey, connectionId)
    },

    log(msg, opts) {
      const level = opts?.level || 'info'
      console.log(`[nango-action][${level}] ${msg}`)
    },

    ActionError,
  }
}
