/**
 * Agent Bridge — Heartbeat Manager
 *
 * Reports system metrics to the control plane every 30s.
 * On success, resets the offline buffer's dropped count and reports it.
 * On failure, pushes the heartbeat into the offline buffer for later delivery.
 *
 * Lifecycle: start() → beat every N ms → stop() | sendShutdown()
 *
 * Non-blocking: beat() is fire-and-forget — the interval never awaits.
 * This prevents a slow/stuck heartbeat from delaying the next one.
 */

import type { RestClient } from './http-client.js'
import type { OfflineBuffer } from './offline-buffer.js'
import type {
  BridgeLogger,
  HeartbeatPayload,
  HeartbeatResponse,
  RuntimeManagementCommandHandler,
} from './types.js'
import { getCpuPercent, getRamPercent, getUptimeSeconds } from './metrics-collector.js'

export class HeartbeatManager {
  private timer: ReturnType<typeof setInterval> | undefined
  private readonly runtimeId: string
  private readonly generation: number
  private readonly intervalMs: number
  private readonly engine: string
  private readonly runtimeProtocol: string
  private readonly engineVersion: string
  private readonly runtimeVersion: string
  private readonly capabilityReport: Partial<HeartbeatPayload>
  private readonly onManagementCommands?: RuntimeManagementCommandHandler

  constructor(
    private readonly client: RestClient,
    private readonly buffer: OfflineBuffer,
    private readonly logger: BridgeLogger,
    opts: {
      runtimeId: string
      generation: number
      intervalMs: number
      engine?: string
      runtimeProtocol?: string
      engineVersion?: string
      runtimeVersion?: string
      adapterIdentity?: HeartbeatPayload['adapterIdentity']
      nativeCapabilities?: HeartbeatPayload['nativeCapabilities']
      runtimeServices?: HeartbeatPayload['runtimeServices']
      adapterProbe?: HeartbeatPayload['adapterProbe']
      transcriptParser?: HeartbeatPayload['transcriptParser']
      commandSpec?: HeartbeatPayload['commandSpec']
      engineHomePolicy?: HeartbeatPayload['engineHomePolicy']
      onManagementCommands?: RuntimeManagementCommandHandler
    },
  ) {
    this.runtimeId = opts.runtimeId
    this.generation = opts.generation
    this.intervalMs = opts.intervalMs
    this.engine = opts.engine || 'openclaw'
    this.runtimeProtocol = opts.runtimeProtocol || 'lucid-runtime-v2'
    this.engineVersion = opts.engineVersion || 'agent-bridge/0.1.0'
    this.runtimeVersion = opts.runtimeVersion || 'agent-bridge/0.1.0'
    this.capabilityReport = {
      ...(opts.adapterIdentity !== undefined && { adapterIdentity: opts.adapterIdentity }),
      ...(opts.nativeCapabilities !== undefined && { nativeCapabilities: opts.nativeCapabilities }),
      ...(opts.runtimeServices !== undefined && { runtimeServices: opts.runtimeServices }),
      ...(opts.adapterProbe !== undefined && { adapterProbe: opts.adapterProbe }),
      ...(opts.transcriptParser !== undefined && { transcriptParser: opts.transcriptParser }),
      ...(opts.commandSpec !== undefined && { commandSpec: opts.commandSpec }),
      ...(opts.engineHomePolicy !== undefined && { engineHomePolicy: opts.engineHomePolicy }),
    }
    this.onManagementCommands = opts.onManagementCommands
  }

  start(): void {
    this.beat()
    this.timer = setInterval(() => this.beat(), this.intervalMs)
    this.logger.info(`Heartbeat started (every ${this.intervalMs / 1000}s, generation=${this.generation})`)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
      this.logger.info('Heartbeat stopped')
    }
  }

  /** Final heartbeat with status='shutdown' so the control plane transitions immediately. */
  async sendShutdown(): Promise<void> {
    try {
      await this.client.post('/api/runtimes/heartbeat', this.buildPayload('shutdown'))
      this.logger.info('Shutdown heartbeat sent')
    } catch (err) {
      this.logger.error('Failed to send shutdown heartbeat:', err instanceof Error ? err.message : err)
    }
  }

  // ── Internal ──────────────────────────────────────────────────────

  private beat(): void {
    const payload = this.buildPayload()

    // Piggyback dropped telemetry count so the control plane knows about gaps
    const withMeta = this.buffer.droppedCount > 0
      ? { ...payload, _droppedTelemetry: this.buffer.droppedCount }
      : payload

    this.client.post<HeartbeatResponse>('/api/runtimes/heartbeat', withMeta).then((response) => {
      // Reset dropped count after successful delivery
      if (this.buffer.droppedCount > 0) {
        this.buffer.droppedCount = 0
      }
      const commands = response.managementCommands ?? []
      if (commands.length > 0) {
        if (!this.onManagementCommands) {
          this.logger.warn(`Received ${commands.length} management command(s), but no handler is registered`)
          return
        }
        void this.onManagementCommands(commands)
          .then(async (acks) => {
            for (const ack of acks ?? []) {
              try {
                await this.client.post('/api/runtimes/commands/ack', ack)
              } catch (error) {
                this.logger.error(
                  `Failed to acknowledge management command ${ack.commandId}:`,
                  error instanceof Error ? error.message : error,
                )
              }
            }
          })
          .catch((error) => {
            this.logger.error(
              'Management command handler failed:',
              error instanceof Error ? error.message : error,
            )
          })
      }
    }).catch(() => {
      // Offline — buffer the heartbeat for later
      this.buffer.push({ type: 'heartbeat', payload, timestamp: Date.now() })
    })
  }

  private buildPayload(status?: 'connected' | 'shutdown'): HeartbeatPayload {
    return {
      runtimeId: this.runtimeId,
      generation: this.generation,
      engine: this.engine,
      runtimeProtocol: this.runtimeProtocol,
      engineVersion: this.engineVersion,
      runtimeVersion: this.runtimeVersion,
      cpuPercent: getCpuPercent(),
      ramPercent: getRamPercent(),
      diskPercent: 0, // Disk is expensive to check — default to 0 (matches worker)
      pendingEvents: 0,
      deadLetters: 0,
      openclawVersion: this.runtimeVersion,
      agentCount: 0,
      uptimeSeconds: getUptimeSeconds(),
      ...this.capabilityReport,
      ...(status && { status }),
    }
  }
}
