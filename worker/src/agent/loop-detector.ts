/**
 * Mission Control — Loop Detector
 *
 * Tracks tool calls within a run and detects stuck loops.
 * A loop is when the same tool+args hash is called > N times.
 *
 * Phase 2 feature — stubbed in Phase 1 for forward compatibility.
 */

import crypto from 'node:crypto'

const DEFAULT_THRESHOLD = 3

export class LoopDetector {
  private callCounts = new Map<string, number>()
  private threshold: number

  constructor(threshold = DEFAULT_THRESHOLD) {
    this.threshold = threshold
  }

  /**
   * Record a tool call. Returns loop info if threshold exceeded.
   */
  record(toolName: string, args: Record<string, unknown>): LoopDetection | null {
    const key = this.hashCall(toolName, args)
    const count = (this.callCounts.get(key) ?? 0) + 1
    this.callCounts.set(key, count)

    if (count > this.threshold) {
      return {
        toolName,
        args,
        callCount: count,
        threshold: this.threshold,
        explanation: `Agent called ${toolName} with the same arguments ${count} times in a row. This looks like a stuck loop.`,
      }
    }

    return null
  }

  /**
   * Reset all counts (e.g., between runs).
   */
  reset(): void {
    this.callCounts.clear()
  }

  private hashCall(toolName: string, args: Record<string, unknown>): string {
    const payload = JSON.stringify({ t: toolName, a: args })
    return crypto.createHash('md5').update(payload).digest('hex')
  }
}

export interface LoopDetection {
  toolName: string
  args: Record<string, unknown>
  callCount: number
  threshold: number
  explanation: string
}
