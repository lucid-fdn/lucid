/**
 * Sentry Hook — integrates Sentry error tracking into OpenClaw's processing pipeline.
 * Captures errors with rich context (tenant, assistant, session, channel).
 */

export interface SentryHookConfig {
  dsn?: string
  environment?: string
  release?: string
}

export class SentryHook {
  private initialized = false

  constructor(private config: SentryHookConfig) {}

  /** Initialize Sentry (call once at startup) */
  async init(): Promise<void> {
    if (!this.config.dsn || this.initialized) return

    try {
      // Dynamic import to avoid bundling Sentry when not configured
      const Sentry = await import('@sentry/node')
      Sentry.init({
        dsn: this.config.dsn,
        environment: this.config.environment ?? 'production',
        release: this.config.release,
        tracesSampleRate: 0.1,
      })
      this.initialized = true
    } catch {
      console.warn('[SentryHook] Failed to initialize Sentry — continuing without error tracking')
    }
  }

  /** Capture an error with context */
  async captureError(error: Error, context?: {
    assistantId?: string
    sessionId?: string
    channelType?: string
    orgId?: string
    projectId?: string
    operation?: string
  }): Promise<void> {
    if (!this.initialized) {
      console.error('[SentryHook] Error (Sentry not initialized):', error.message, context)
      return
    }

    try {
      const Sentry = await import('@sentry/node')
      Sentry.withScope((scope) => {
        if (context?.assistantId) scope.setTag('assistant_id', context.assistantId)
        if (context?.sessionId) scope.setTag('session_id', context.sessionId)
        if (context?.channelType) scope.setTag('channel_type', context.channelType)
        if (context?.orgId) scope.setTag('org_id', context.orgId)
        if (context?.projectId) scope.setTag('project_id', context.projectId)
        if (context?.operation) scope.setTag('operation', context.operation)
        Sentry.captureException(error)
      })
    } catch {
      console.error('[SentryHook] Failed to capture error:', error.message)
    }
  }

  /** Record a breadcrumb for debugging */
  async addBreadcrumb(message: string, data?: Record<string, unknown>): Promise<void> {
    if (!this.initialized) return

    try {
      const Sentry = await import('@sentry/node')
      Sentry.addBreadcrumb({
        message,
        data,
        level: 'info',
        timestamp: Date.now() / 1000,
      })
    } catch {
      // Silent fail for breadcrumbs
    }
  }
}