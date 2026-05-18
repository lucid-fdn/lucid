/**
 * Generic Response Shaper — handles 11 small providers with 1-5 actions each.
 * Strips bloat keys, limits array sizes, and caps object depth.
 */

import type { ShaperResult } from '../response-shaper.js'
import { compacted, passthrough, detectPagination } from '../response-shaper.js'

const BLOAT_KEYS = new Set(['_links', '_embedded', 'metadata', 'request_id', '_rawJSON', 'request_params'])

/** Find the main array key in a response object */
function findArrayKey(data: Record<string, unknown>): string | null {
  const knownKeys = ['results', 'records', 'items', 'data', 'entries', 'values', 'list', 'objects', 'resources', 'issues', 'projects', 'teams', 'calls', 'transcripts', 'users', 'meetings']
  for (const key of knownKeys) {
    if (key in data && Array.isArray(data[key])) return key
  }
  // Fallback: find first array value
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v) && v.length > 0) return k
  }
  return null
}

export function compactGenericObject(obj: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (BLOAT_KEYS.has(k)) continue
    if (Array.isArray(v)) {
      out[k] = depth < 2
        ? v.slice(0, 10).map(i => typeof i === 'object' && i !== null ? compactGenericObject(i as Record<string, unknown>, depth + 1) : i)
        : `[${v.length} items]`
    } else if (typeof v === 'object' && v !== null) {
      out[k] = depth < 2 ? compactGenericObject(v as Record<string, unknown>, depth + 1) : '[object]'
    } else {
      out[k] = v
    }
  }
  return out
}

export function shapeGenericResponse(actionName: string, result: unknown): ShaperResult {
  if (typeof result !== 'object' || result === null) return passthrough(result)
  const data = result as Record<string, unknown>
  const arrayKey = findArrayKey(data)
  if (arrayKey && Array.isArray(data[arrayKey])) {
    const items = (data[arrayKey] as Record<string, unknown>[]).slice(0, 25)
    const compactedItems = items.map(item =>
      typeof item === 'object' && item !== null ? compactGenericObject(item as Record<string, unknown>) : item,
    )
    const pagination = detectPagination(data)
    const shaped = {
      results: compactedItems,
      _total: (data[arrayKey] as unknown[]).length,
      _compact: true as const,
      ...pagination,
    }
    return compacted(result, shaped, compactedItems.length)
  }
  // Single object — strip depth
  return compacted(result, compactGenericObject(data), 1)
}
