/**
 * Pulse Webhook Executor
 *
 * Dispatches steps to external agents via HTTP POST, waits for callback.
 * Supports inline 2xx responses (skip polling) and async callbacks.
 *
 * Throw-based contract: returns void on success, throws on failure.
 * BaseWorker handles queue.complete() / queue.fail().
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { lookup } from 'dns/promises'
import net from 'net'
import type { StepExecutor, StepExecutionContext } from './types.js'
import { createStep, updateStepStatus, getStepById } from './step-tracker.js'
import { withSpan } from '../../observability/tracing.js'

const DEFAULT_TIMEOUT_SECONDS = 300 // 5 minutes
const MAX_TIMEOUT_SECONDS = 1800    // 30 minutes
const POLL_INTERVAL_MS = 5_000
const MAX_DELIVERY_RETRIES = 3
const DELIVERY_BACKOFF_BASE_MS = 1_000 // 1s, 2s, 4s

export class WebhookExecutor implements StepExecutor {
  readonly type = 'webhook'

  canHandle(stepType: string): boolean {
    return stepType === 'webhook'
  }

  async execute(ctx: StepExecutionContext): Promise<void> {
    const { job, supabase, config, abortController } = ctx
    const webhookSecret = config.PULSE_WEBHOOK_SECRET

    if (!webhookSecret) {
      throw new Error('PULSE_WEBHOOK_SECRET is required for webhook executor')
    }

    if (!job.webhookUrl) {
      throw new Error('webhookUrl is required for webhook step')
    }

    await assertSafeWebhookUrl(job.webhookUrl)

    const timeoutSeconds = Math.min(
      (job.approvalConfig?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS),
      MAX_TIMEOUT_SECONDS,
    )
    const timeoutAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString()

    // Create step record (best-effort)
    const stepId = await createStep(supabase, {
      runId: job.runId,
      eventId: job.eventId,
      attempt: job.attempt,
      stepType: 'webhook',
      executorType: this.type,
      agentId: job.agentId,
      orgId: job.orgId,
      webhookUrl: job.webhookUrl,
      timeoutAt,
      input: job.webhookPayload ? JSON.parse(job.webhookPayload) : undefined,
    })

    if (!stepId) {
      throw new Error('Failed to create orchestration step record')
    }

    // Generate HMAC callback token (recomputed, never stored)
    const callbackToken = generateCallbackToken(stepId, job.runId, webhookSecret)

    // Build callback URL
    const controlPlaneUrl = config.LUCID_CONTROL_PLANE_URL || config.SUPABASE_URL?.replace('.supabase.co', '')
    const callbackUrl = `${controlPlaneUrl}/api/runtimes/step-callback`

    // POST to webhook
    const inlineResult = await withSpan('pulse.step.webhook.post', {
      'lucid.pulse.step_type': 'webhook',
      'lucid.pulse.webhook_url': job.webhookUrl,
    }, () => this.deliverWebhook(job.webhookUrl!, {
      stepId,
      runId: job.runId,
      eventId: job.eventId,
      eventType: job.eventType,
      agentId: job.agentId,
      orgId: job.orgId,
      callbackUrl,
      callbackToken,
      payload: job.webhookPayload ? JSON.parse(job.webhookPayload) : {},
      timeoutSeconds,
    }))

    // If inline response, handle it directly
    if (inlineResult) {
      const durationMs = Date.now() - Date.parse(timeoutAt) + timeoutSeconds * 1000
      if (inlineResult.status === 'completed') {
        await updateStepStatus(supabase, stepId, {
          status: 'completed',
          output: inlineResult.output,
          callbackStatus: 'received',
          completedAt: new Date().toISOString(),
          durationMs,
        })
        return // Success
      } else {
        await updateStepStatus(supabase, stepId, {
          status: 'failed',
          errorMessage: inlineResult.errorMessage ?? 'External agent returned failure',
          callbackStatus: 'received',
          completedAt: new Date().toISOString(),
          durationMs,
        })
        throw new Error(inlineResult.errorMessage ?? 'External agent returned failure')
      }
    }

    // Poll for async callback
    await withSpan('pulse.step.webhook.wait', {
      'lucid.pulse.step_id': stepId,
    }, () => this.pollForCallback(supabase, stepId, timeoutAt, abortController.signal))
  }

  /**
   * POST the webhook payload with retry on 5xx/timeout.
   * Returns inline result if 2xx with valid JSON body, null otherwise.
   */
  private async deliverWebhook(
    url: string,
    payload: Record<string, unknown>,
  ): Promise<{ status: string; output?: string; errorMessage?: string } | null> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < MAX_DELIVERY_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Pulse-Step-Id': payload.stepId as string,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30_000), // 30s per attempt
        })

        if (response.ok) {
          // Try to parse inline response
          try {
            const body = await response.json() as Record<string, unknown>
            if (body && typeof body.status === 'string') {
              return {
                status: body.status as string,
                output: typeof body.output === 'string' ? body.output : undefined,
                errorMessage: typeof body.errorMessage === 'string' ? body.errorMessage : undefined,
              }
            }
          } catch {
            // Not JSON or no status field — treat as accepted, poll for callback
          }
          return null // 2xx but no inline result — poll
        }

        if (response.status >= 400 && response.status < 500) {
          // 4xx — don't retry
          throw new Error(`Webhook POST failed with ${response.status}: ${response.statusText}`)
        }

        // 5xx — retry
        lastError = new Error(`Webhook POST returned ${response.status}`)
      } catch (err) {
        if (err instanceof Error && err.message.includes('Webhook POST failed with 4')) {
          throw err // Don't retry 4xx
        }
        lastError = err instanceof Error ? err : new Error('Webhook delivery failed')
      }

      // Exponential backoff before retry
      if (attempt < MAX_DELIVERY_RETRIES - 1) {
        const delayMs = DELIVERY_BACKOFF_BASE_MS * Math.pow(2, attempt)
        await new Promise(r => setTimeout(r, delayMs))
      }
    }

    throw lastError ?? new Error('Webhook delivery failed after retries')
  }

  /**
   * Poll orchestration_steps for callback receipt.
   * Respects AbortSignal for graceful shutdown.
   */
  private async pollForCallback(
    supabase: any,
    stepId: string,
    timeoutAt: string,
    signal: AbortSignal,
  ): Promise<void> {
    const deadline = Date.parse(timeoutAt)

    while (Date.now() < deadline) {
      if (signal.aborted) {
        await updateStepStatus(supabase, stepId, {
          status: 'cancelled',
          errorMessage: 'Worker shutting down',
          completedAt: new Date().toISOString(),
        })
        throw new Error('Step cancelled: worker shutting down')
      }

      const step = await getStepById(supabase, stepId)

      if (step?.callback_status === 'received') {
        const durationMs = Date.now() - (deadline - Date.parse(timeoutAt) + Date.now())
        if (step.status === 'failed' || step.error_message) {
          throw new Error(step.error_message ?? 'External agent returned failure')
        }
        // Success — callback received with completed status
        return
      }

      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }

    // Timeout
    await updateStepStatus(supabase, stepId, {
      status: 'failed',
      errorMessage: 'Step timed out waiting for callback',
      completedAt: new Date().toISOString(),
    })
    throw new Error('Step timed out waiting for callback')
  }
}

export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:') {
    throw new Error('webhookUrl must use HTTPS')
  }
  if (url.username || url.password) {
    throw new Error('webhookUrl must not include credentials')
  }

  const hostname = url.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    throw new Error('webhookUrl must not target localhost or private networks')
  }

  const records = await lookup(hostname, { all: true, verbatim: true })
  if (records.length === 0) {
    throw new Error('webhookUrl hostname could not be resolved')
  }
  for (const record of records) {
    if (isPrivateOrReservedAddress(record.address)) {
      throw new Error('webhookUrl must not resolve to localhost or private networks')
    }
  }
}

function isPrivateOrReservedAddress(address: string): boolean {
  const family = net.isIP(address)
  if (family === 4) {
    const parts = address.split('.').map((part) => Number(part))
    const [a, b] = parts
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
  }
  if (family === 6) {
    const normalized = address.toLowerCase()
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('ff')
    )
  }
  return true
}

// ─── HMAC Helpers ──────────────────────────────────────────────────────────────

/**
 * Generate HMAC-SHA256 callback token from stepId + runId + secret.
 * Deterministic — can be recomputed on callback receipt.
 */
export function generateCallbackToken(stepId: string, runId: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${stepId}:${runId}`)
    .digest('hex')
}

/**
 * Verify a callback token with timing-safe comparison.
 */
export function verifyCallbackToken(
  token: string,
  stepId: string,
  runId: string,
  secret: string,
): boolean {
  const expected = generateCallbackToken(stepId, runId, secret)
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false // Different lengths
  }
}
