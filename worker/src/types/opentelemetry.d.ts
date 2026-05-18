declare module '@opentelemetry/sdk-node' {
  export class NodeSDK {
    constructor(options: Record<string, unknown>)
    start(): void
    shutdown(): Promise<void>
  }
}

declare module '@opentelemetry/exporter-trace-otlp-http' {
  export class OTLPTraceExporter {
    constructor(options?: { url?: string; headers?: Record<string, string> })
  }
}

declare module '@opentelemetry/resources' {
  export class Resource {
    static default(): Resource
    merge(other: Resource): Resource
    constructor(attributes: Record<string, string | number | boolean>)
  }
  export function resourceFromAttributes(attributes: Record<string, string | number | boolean>): Resource
}

declare module '@opentelemetry/semantic-conventions' {
  export const SEMRESATTRS_SERVICE_NAME: string
  export const SEMRESATTRS_SERVICE_VERSION: string
  export const ATTR_SERVICE_NAME: string
  export const ATTR_SERVICE_VERSION: string
}

declare module '@opentelemetry/sdk-trace-base' {
  export class BatchSpanProcessor {
    constructor(exporter: unknown)
  }
  export class SimpleSpanProcessor {
    constructor(exporter: unknown)
  }
}
