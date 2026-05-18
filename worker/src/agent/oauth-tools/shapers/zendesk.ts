/**
 * Zendesk Response Shaper — compacts tickets and articles.
 */

import type { ShaperResult } from '../response-shaper.js'
import { compacted, passthrough, detectPagination } from '../response-shaper.js'

function compactZendeskTicket(t: Record<string, unknown>): Record<string, unknown> {
  return {
    id: t.id,
    subject: t.subject ?? null,
    status: t.status ?? null,
    priority: t.priority ?? null,
    created_at: t.created_at ?? null,
    updated_at: t.updated_at ?? null,
    assignee_id: t.assignee_id ?? null,
  }
}

function compactZendeskArticle(a: Record<string, unknown>): Record<string, unknown> {
  return {
    id: a.id,
    title: a.title ?? null,
    section_id: a.section_id ?? null,
    html_url: a.html_url ?? null,
    created_at: a.created_at ?? null,
  }
}

const TICKET_ACTIONS = new Set(['search-tickets', 'list-tickets', 'get-ticket'])
const ARTICLE_ACTIONS = new Set(['fetch-articles', 'list-articles', 'search-articles', 'get-article'])

export function shapeZendeskResponse(actionName: string, result: unknown): ShaperResult {
  if (typeof result !== 'object' || result === null) return passthrough(result)
  const data = result as Record<string, unknown>

  if (TICKET_ACTIONS.has(actionName)) {
    const tickets = (data.tickets ?? data.results) as Record<string, unknown>[] | undefined
    if (Array.isArray(tickets)) {
      const items = tickets.map(compactZendeskTicket)
      const pagination = detectPagination(data)
      return compacted(result, { results: items, _compact: true, ...pagination }, items.length)
    }
    if (data.ticket && typeof data.ticket === 'object') {
      return compacted(result, compactZendeskTicket(data.ticket as Record<string, unknown>), 1)
    }
    if (data.id && data.subject !== undefined) {
      return compacted(result, compactZendeskTicket(data), 1)
    }
  }

  if (ARTICLE_ACTIONS.has(actionName)) {
    const articles = (data.articles ?? data.results) as Record<string, unknown>[] | undefined
    if (Array.isArray(articles)) {
      const items = articles.map(compactZendeskArticle)
      const pagination = detectPagination(data)
      return compacted(result, { results: items, _compact: true, ...pagination }, items.length)
    }
    if (data.article && typeof data.article === 'object') {
      return compacted(result, compactZendeskArticle(data.article as Record<string, unknown>), 1)
    }
  }

  return passthrough(result)
}
