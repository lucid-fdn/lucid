/**
 * HubSpot Response Shaper — compacts CRM entities with property allowlists.
 */

import type { ShaperResult } from '../response-shaper.js'
import { compacted, passthrough, detectPagination } from '../response-shaper.js'

const ENTITY_PROPS: Record<string, string[]> = {
  contact: ['firstname', 'lastname', 'email', 'company', 'phone'],
  company: ['name', 'domain', 'industry'],
  deal: ['dealname', 'amount', 'dealstage', 'pipeline'],
  ticket: ['subject', 'content', 'hs_pipeline_stage'],
}

function compactHubSpotEntity(entity: Record<string, unknown>, keepProps?: string[]): Record<string, unknown> {
  const props = entity.properties as Record<string, unknown> | undefined
  const filteredProps: Record<string, unknown> = {}
  if (props && keepProps) {
    for (const key of keepProps) {
      if (key in props) filteredProps[key] = props[key]
    }
  } else if (props) {
    Object.assign(filteredProps, props)
  }
  return {
    id: entity.id,
    properties: filteredProps,
    createdAt: entity.createdAt ?? null,
    updatedAt: entity.updatedAt ?? null,
  }
}

function inferEntityType(actionName: string): string | null {
  if (actionName.includes('contact')) return 'contact'
  if (actionName.includes('compan')) return 'company'
  if (actionName.includes('deal')) return 'deal'
  if (actionName.includes('ticket')) return 'ticket'
  return null
}

const HUBSPOT_LIST_ACTIONS = new Set([
  'list-contacts', 'list-companies', 'list-deals', 'list-tickets',
  'search-contacts', 'search-companies', 'search-deals', 'search-tickets',
  'list-marketing-emails', 'list-forms',
])

const HUBSPOT_GET_ACTIONS = new Set([
  'get-contact', 'get-company', 'get-deal', 'get-ticket',
])

export function shapeHubSpotResponse(actionName: string, result: unknown): ShaperResult {
  if (typeof result !== 'object' || result === null) return passthrough(result)
  const data = result as Record<string, unknown>
  const entityType = inferEntityType(actionName)
  const keepProps = entityType ? ENTITY_PROPS[entityType] : undefined

  if (HUBSPOT_LIST_ACTIONS.has(actionName)) {
    const results = data.results as Record<string, unknown>[] | undefined
    if (Array.isArray(results)) {
      const items = results.map(e => compactHubSpotEntity(e, keepProps))
      const pagination = detectPagination(data)
      return compacted(result, { results: items, _compact: true, ...pagination }, items.length)
    }
  }

  if (HUBSPOT_GET_ACTIONS.has(actionName)) {
    if (data.id) {
      return compacted(result, compactHubSpotEntity(data, keepProps), 1)
    }
  }

  return passthrough(result)
}
