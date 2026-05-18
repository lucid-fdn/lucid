/**
 * Agent Bridge — System Metrics
 *
 * CPU, RAM, and uptime collection via node:os.
 * Extracted from worker/src/runtime/heartbeat.ts.
 *
 * CPU percent is a snapshot (not a delta) — measures instantaneous load
 * across all cores. Acceptable for 30s heartbeat granularity.
 */

import os from 'node:os'

const startedAt = Date.now()

/** Instantaneous CPU utilization across all cores (0-100). */
export function getCpuPercent(): number {
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

/** Current RAM utilization (0-100). */
export function getRamPercent(): number {
  const total = os.totalmem()
  const free = os.freemem()
  return total > 0 ? Math.round(((total - free) / total) * 100) : 0
}

/** Seconds since the bridge process started. */
export function getUptimeSeconds(): number {
  return Math.floor((Date.now() - startedAt) / 1000)
}
