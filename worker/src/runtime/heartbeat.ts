/**
 * Heartbeat Loop — Reports system metrics to the control plane every 30s.
 *
 * Only active when IS_DEDICATED_RUNTIME=true (RestDataSink).
 * Metrics: CPU, RAM, disk, GPU (if available), queue depth, version.
 */

import os from 'os'
import fs from 'fs'
import type { DataSink, HeartbeatPayload } from './data-sink.js'
import { bootstrapRuntimeConfig } from '../config-bootstrap.js'
import { refreshConfigFromEnv } from '../config.js'
import { buildRuntimeCapabilityHeartbeatFields } from './capability-report.js'
import { processRuntimeManagementCommands } from './management-commands.js'

const HEARTBEAT_INTERVAL_MS = 30_000
const startedAt = Date.now()

let timer: ReturnType<typeof setInterval> | undefined
let configRefreshInFlight: Promise<void> | null = null

function getRuntimeEngine(): string {
  return process.env.LUCID_ENGINE || 'openclaw'
}

function getRuntimeProtocol(): string {
  return process.env.LUCID_RUNTIME_PROTOCOL || 'lucid-runtime-v2'
}

function getRuntimeVersion(): string {
  return process.env.npm_package_version || 'unknown'
}

function buildHeartbeatPayload(
  runtimeId: string,
  generation: number,
  agentCount: number,
  status?: 'connected' | 'shutdown',
): HeartbeatPayload {
  const runtimeVersion = getRuntimeVersion()
  return {
    runtimeId,
    generation,
    engine: getRuntimeEngine(),
    runtimeProtocol: getRuntimeProtocol(),
    engineVersion: runtimeVersion,
    runtimeVersion,
    cpuPercent: getCpuPercent(),
    ramPercent: getRamPercent(),
    diskPercent: 0, // Disk is expensive to check — default to 0
    pendingEvents: 0,
    deadLetters: 0,
    openclawVersion: runtimeVersion,
    agentCount,
    uptimeSeconds: getUptimeSeconds(),
    systemInfo: getSystemInfo(),
    ...buildRuntimeCapabilityHeartbeatFields(),
    ...(status && { status }),
  }
}

function getCpuPercent(): number {
  const cpus = os.cpus()
  if (cpus.length === 0) return 0
  let totalIdle = 0
  let totalTick = 0
  for (const cpu of cpus) {
    totalIdle += cpu.times.idle
    totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle
  }
  return totalTick > 0 ? Math.round(((totalTick - totalIdle) / totalTick) * 100) : 0
}

function getRamPercent(): number {
  const total = os.totalmem()
  const free = os.freemem()
  return total > 0 ? Math.round(((total - free) / total) * 100) : 0
}

function getUptimeSeconds(): number {
  return Math.floor((Date.now() - startedAt) / 1000)
}

/** Read a cgroup file, returning its trimmed content or null on failure. */
function readCgroup(v2Path: string, v1Path: string): string | null {
  for (const p of [v2Path, v1Path]) {
    try { return fs.readFileSync(p, 'utf8').trim() } catch { /* try next */ }
  }
  return null
}

/**
 * Container-aware RAM limit in GB.
 * Prefers cgroup limit over os.totalmem() (which reports the host, not the container).
 * Falls back to os.totalmem() when running outside Docker or cgroup files are absent.
 */
function getContainerRamGb(): number {
  // cgroups v2
  const v2 = readCgroup('/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes')
  if (v2 && v2 !== 'max') {
    const bytes = parseInt(v2, 10)
    if (!isNaN(bytes) && bytes > 0 && bytes < Number.MAX_SAFE_INTEGER) {
      return Math.round((bytes / (1024 ** 3)) * 10) / 10
    }
  }
  return Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10
}

/**
 * Container-aware CPU core count.
 * Reads cpu.max quota (cgroups v2) or cfs_quota_us/cfs_period_us (cgroups v1).
 * Falls back to os.cpus().length when quota is unlimited or files are absent.
 */
function getContainerCpuCores(): number {
  // cgroups v2: "quota period" e.g. "50000 100000" = 0.5 cores, "max 100000" = unlimited
  const v2 = readCgroup('/sys/fs/cgroup/cpu.max', '')
  if (v2 && !v2.startsWith('max')) {
    const [quota, period] = v2.split(' ').map(Number)
    if (quota > 0 && period > 0) return Math.max(1, Math.ceil(quota / period))
  }
  // cgroups v1
  const quota = readCgroup('', '/sys/fs/cgroup/cpu/cpu.cfs_quota_us')
  const period = readCgroup('', '/sys/fs/cgroup/cpu/cpu.cfs_period_us')
  if (quota && period) {
    const q = parseInt(quota, 10), p = parseInt(period, 10)
    if (q > 0 && p > 0) return Math.max(1, Math.ceil(q / p))
  }
  return os.cpus().length
}

function getSystemInfo() {
  const cpus = os.cpus()
  return {
    cpuModel: cpus[0]?.model?.trim() || undefined,
    cpuCores: getContainerCpuCores() || undefined,
    ramTotalGb: getContainerRamGb(),
    platform: os.platform(),
    arch: os.arch(),
  }
}

async function refreshRuntimeConfigOnDrift(configVersion: string): Promise<void> {
  if (!configVersion || process.env.LUCID_CONFIG_VERSION === configVersion) return
  if (configRefreshInFlight) return configRefreshInFlight

  configRefreshInFlight = (async () => {
    try {
      console.log(
        `[heartbeat] Config drift detected (${String(process.env.LUCID_CONFIG_VERSION || 'none').slice(0, 8)} → ${configVersion.slice(0, 8)})`,
      )
      await bootstrapRuntimeConfig()
      refreshConfigFromEnv()
    } finally {
      configRefreshInFlight = null
    }
  })()

  return configRefreshInFlight
}

export function startHeartbeat(
  dataSink: DataSink,
  runtimeId: string,
  generation: number,
  getAgentCount: () => number
): void {
  async function beat() {
    try {
      const payload = buildHeartbeatPayload(runtimeId, generation, getAgentCount())
      const configVersion = await dataSink.reportHeartbeat(payload)
      if (configVersion) {
        await refreshRuntimeConfigOnDrift(configVersion)
      }
      const commands = dataSink.takeManagementCommands?.() ?? []
      if (commands.length > 0) {
        await processRuntimeManagementCommands(commands, dataSink)
      }
    } catch (err) {
      console.error('[heartbeat] Failed to report:', err instanceof Error ? err.message : err)
    }
  }

  // Initial heartbeat
  beat()

  // Recurring
  timer = setInterval(beat, HEARTBEAT_INTERVAL_MS)
  console.log(`[heartbeat] Started (every ${HEARTBEAT_INTERVAL_MS / 1000}s, generation=${generation})`)
}

export function stopHeartbeat(): void {
  if (timer) {
    clearInterval(timer)
    timer = undefined
    console.log('[heartbeat] Stopped')
  }
}

/** Send a final heartbeat with status='shutdown' so control plane knows immediately. */
export async function sendShutdownHeartbeat(
  dataSink: DataSink,
  runtimeId: string,
  generation: number
): Promise<void> {
  try {
    await dataSink.reportHeartbeat(buildHeartbeatPayload(runtimeId, generation, 0, 'shutdown'))
    console.log('[heartbeat] Shutdown heartbeat sent')
  } catch (err) {
    console.error('[heartbeat] Failed to send shutdown heartbeat:', err instanceof Error ? err.message : err)
  }
}
