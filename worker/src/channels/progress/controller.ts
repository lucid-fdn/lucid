import type { ChannelOutput } from '../ChannelOutput.js'
import { sanitizeProgressText } from '../../core/progress/labels.js'
import type {
  ChannelProgressDescriptor,
  ChannelProgressEvent,
} from '../../core/progress/types.js'

export interface ChannelProgressControllerOptions {
  runId?: string
  channelType?: string
  output?: ChannelOutput | null
  minIntervalMs?: number
  maxHistory?: number
  onEvent?: (event: ChannelProgressEvent) => void | Promise<void>
}

export interface ChannelProgressController {
  emit(descriptor: ChannelProgressDescriptor): void
  emitPhase(phase: ChannelProgressDescriptor['phase'], label: string, extras?: Omit<ChannelProgressDescriptor, 'phase' | 'label'>): void
  complete(label?: string): void
  fail(error: unknown): void
  getHistory(): ChannelProgressEvent[]
}

function randomProgressId(): string {
  return `progress_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function shouldRenderStatus(event: ChannelProgressEvent): boolean {
  return event.phase !== 'completed' && event.phase !== 'failed'
}

function errorLabel(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return sanitizeProgressText(error.message, 80)
  }
  return 'Agent run failed'
}

export function createChannelProgressController(
  options: ChannelProgressControllerOptions = {},
): ChannelProgressController {
  const minIntervalMs = options.minIntervalMs ?? 900
  const maxHistory = options.maxHistory ?? 50
  const history: ChannelProgressEvent[] = []
  let lastRenderedKey = ''
  let lastRenderedAt = 0
  let closed = false

  function publish(descriptor: ChannelProgressDescriptor): void {
    if (closed && descriptor.phase !== 'completed' && descriptor.phase !== 'failed') return

    const label = sanitizeProgressText(descriptor.label)
    if (!label) return

    const event: ChannelProgressEvent = {
      id: randomProgressId(),
      runId: options.runId,
      phase: descriptor.phase,
      label,
      detail: descriptor.detail ? sanitizeProgressText(descriptor.detail, 160) : undefined,
      capability: descriptor.capability ? sanitizeProgressText(descriptor.capability, 120) : undefined,
      riskLevel: descriptor.riskLevel,
      timestamp: new Date().toISOString(),
      source: descriptor.source ?? 'system',
    }

    history.push(event)
    if (history.length > maxHistory) history.shift()

    void Promise.resolve(options.onEvent?.(event)).catch((err: unknown) => {
      console.warn('[channel-progress] onEvent failed:', err instanceof Error ? err.message : err)
    })

    if (!shouldRenderStatus(event) || typeof options.output?.status !== 'function') return

    const key = `${event.phase}:${event.label}`
    const now = Date.now()
    if (key === lastRenderedKey && now - lastRenderedAt < minIntervalMs) return
    lastRenderedKey = key
    lastRenderedAt = now

    void options.output.status(event.label).catch((err) => {
      console.warn('[channel-progress] status render failed:', err instanceof Error ? err.message : err)
    })
  }

  return {
    emit: publish,
    emitPhase(phase, label, extras = {}) {
      publish({ ...extras, phase, label })
    },
    complete(label = 'Completed') {
      closed = true
      publish({ phase: 'completed', label, source: 'system' })
    },
    fail(error) {
      closed = true
      publish({ phase: 'failed', label: errorLabel(error), source: 'system' })
    },
    getHistory() {
      return [...history]
    },
  }
}
