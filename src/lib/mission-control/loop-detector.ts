/**
 * Mission Control — Loop Detection Types & Logic
 *
 * Shared between client (display) and worker (detection).
 * Worker-side enforcement is in worker/src/agent/loop-detector.ts.
 */

import { LOOP_DETECTION_THRESHOLD } from './constants'

export interface LoopDetection {
  tool_name: string
  args_hash: string
  call_count: number
  first_call_at: string
  last_call_at: string
}

export interface LoopReport {
  detected: boolean
  loops: LoopDetection[]
  reason: string | null
}

/** Check if a set of tool call records indicates a stuck loop */
export function detectLoops(
  toolCalls: Array<{ tool_name: string; args_hash: string; called_at: string }>
): LoopReport {
  const counts = new Map<string, LoopDetection>()

  for (const call of toolCalls) {
    const key = `${call.tool_name}:${call.args_hash}`
    const existing = counts.get(key)
    if (existing) {
      existing.call_count++
      existing.last_call_at = call.called_at
    } else {
      counts.set(key, {
        tool_name: call.tool_name,
        args_hash: call.args_hash,
        call_count: 1,
        first_call_at: call.called_at,
        last_call_at: call.called_at,
      })
    }
  }

  const loops = Array.from(counts.values()).filter(
    (d) => d.call_count > LOOP_DETECTION_THRESHOLD
  )

  if (loops.length === 0) {
    return { detected: false, loops: [], reason: null }
  }

  const worst = loops.reduce((a, b) => (a.call_count > b.call_count ? a : b))
  return {
    detected: true,
    loops,
    reason: `Agent called ${worst.tool_name} with same arguments ${worst.call_count} times in a row`,
  }
}
