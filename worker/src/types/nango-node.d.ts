declare module '@nangohq/node' {
  export interface ProxyConfiguration {
    endpoint: string
    providerConfigKey: string
    connectionId: string
    data?: unknown
    params?: Record<string, string | number | string[] | number[]>
    headers?: Record<string, string>
    retries?: number
    baseUrlOverride?: string
  }

  export interface NangoResponse<T = unknown> {
    data: T
    status: number
    headers: unknown
  }

  export class Nango {
    constructor(config: { secretKey: string; host?: string })
    get(config: ProxyConfiguration): Promise<NangoResponse>
    post(config: ProxyConfiguration): Promise<NangoResponse>
    put(config: ProxyConfiguration): Promise<NangoResponse>
    patch(config: ProxyConfiguration): Promise<NangoResponse>
    delete(config: ProxyConfiguration): Promise<NangoResponse>
    triggerAction(
      providerConfigKey: string,
      connectionId: string,
      actionName: string,
      input?: unknown,
    ): Promise<unknown>
    getScriptsConfig(): Promise<unknown[]>
    getConnection(providerConfigKey: string, connectionId: string): Promise<unknown>
  }
}
