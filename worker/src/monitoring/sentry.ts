import * as Sentry from '@sentry/node'

interface SentryContext {
  userId?: string
  assistantId?: string
  conversationId?: string
  channel?: string
  runtimeId?: string
  runtimeFlavor?: string
  dedicatedTransportMode?: string
  engine?: string
  [key: string]: unknown
}

export function initSentry(options?: {
  dsn?: string
  environment?: string
  release?: string
  tracesSampleRate?: number
}): void {
  const dsn = options?.dsn || process.env.SENTRY_DSN
  if (!dsn) {
    console.warn('[sentry] No SENTRY_DSN provided - error tracking disabled')
    return
  }

  Sentry.init({
    dsn,
    environment: options?.environment || process.env.NODE_ENV || 'development',
    release: options?.release || process.env.RAILWAY_GIT_COMMIT_SHA || 'development',
    tracesSampleRate: options?.tracesSampleRate ?? 0.1,
    sendDefaultPii: false,
    beforeSend(event, hint) {
      if (event.request?.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
      }
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data) {
            const filtered = { ...breadcrumb.data }
            Object.keys(filtered).forEach((key) => {
              if (key.toLowerCase().includes('key') || key.toLowerCase().includes('token')) {
                filtered[key] = '[REDACTED]'
              }
            })
            return { ...breadcrumb, data: filtered }
          }
          return breadcrumb
        })
      }
      return event
    },
    initialScope: {
      tags: {
        lucid_runtime_id: process.env.LUCID_RUNTIME_ID || undefined,
        lucid_runtime_flavor: process.env.LUCID_RUNTIME_FLAVOR || undefined,
        lucid_dedicated_transport_mode: process.env.LUCID_DEDICATED_TRANSPORT_MODE || undefined,
        lucid_engine: process.env.LUCID_ENGINE || undefined,
      },
    },
  })

  console.log('[sentry] Initialized successfully')
}

export function captureError(error: Error | unknown, context?: SentryContext): void {
  Sentry.withScope((scope) => {
    if (context) {
      if (context.userId) scope.setUser({ id: context.userId })
      scope.setTags({
        channel: context.channel as string,
        assistant_id: context.assistantId as string,
        conversation_id: context.conversationId as string,
        runtime_id: context.runtimeId as string,
        runtime_flavor: context.runtimeFlavor as string,
        dedicated_transport_mode: context.dedicatedTransportMode as string,
        engine: context.engine as string,
      })
      scope.setContext('custom', context)
    }
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)))
  })
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' | 'fatal' = 'info', context?: SentryContext): void {
  Sentry.withScope((scope) => {
    if (context) {
      if (context.userId) scope.setUser({ id: context.userId })
      scope.setTags({
        channel: context.channel as string,
        assistant_id: context.assistantId as string,
        conversation_id: context.conversationId as string,
        runtime_id: context.runtimeId as string,
        runtime_flavor: context.runtimeFlavor as string,
        dedicated_transport_mode: context.dedicatedTransportMode as string,
        engine: context.engine as string,
      })
      scope.setContext('custom', context)
    }
    Sentry.captureMessage(message, level)
  })
}

export function addBreadcrumb(message: string, category = 'custom', data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ message, category, data, level: 'info', timestamp: Date.now() / 1000 })
}

export function setUser(user: { id: string; email?: string; username?: string }): void {
  Sentry.setUser(user)
}

export function clearUser(): void {
  Sentry.setUser(null)
}

export async function flush(timeoutMs = 2000): Promise<boolean> {
  try { return await Sentry.flush(timeoutMs) } catch { return false }
}

export async function close(timeoutMs = 2000): Promise<boolean> {
  try { return await Sentry.close(timeoutMs) } catch { return false }
}
