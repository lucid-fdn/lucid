/**
 * Salesforce Response Shaper — strips attributes metadata from records.
 */

import type { ShaperResult } from '../response-shaper.js'
import { compacted, passthrough, detectPagination } from '../response-shaper.js'

function compactSalesforceRecord(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    if (k === 'attributes') continue
    out[k] = v
  }
  return out
}

const SALESFORCE_LIST_ACTIONS = new Set([
  'query-records', 'search-records', 'fetch-fields',
  'list-accounts', 'list-contacts', 'list-opportunities', 'list-leads',
])

export function shapeSalesforceResponse(actionName: string, result: unknown): ShaperResult {
  if (typeof result !== 'object' || result === null) return passthrough(result)
  const data = result as Record<string, unknown>

  if (SALESFORCE_LIST_ACTIONS.has(actionName) || Array.isArray(data.records)) {
    const records = data.records as Record<string, unknown>[] | undefined
    if (Array.isArray(records)) {
      const items = records.map(compactSalesforceRecord)
      const pagination = detectPagination(data)
      return compacted(result, { results: items, _compact: true, ...pagination }, items.length)
    }
  }

  // Single record
  if (data.Id || data.id) {
    return compacted(result, compactSalesforceRecord(data), 1)
  }

  return passthrough(result)
}
