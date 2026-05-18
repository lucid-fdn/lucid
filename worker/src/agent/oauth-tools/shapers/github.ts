/**
 * GitHub Response Shaper — compacts repos, issues, and PRs.
 */

import type { ShaperResult } from '../response-shaper.js'
import { compacted, passthrough } from '../response-shaper.js'

function compactRepo(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    full_name: r.full_name ?? null,
    description: r.description ?? null,
    html_url: r.html_url ?? null,
    language: r.language ?? null,
    stargazers_count: r.stargazers_count ?? 0,
  }
}

function compactIssue(i: Record<string, unknown>): Record<string, unknown> {
  const user = i.user as Record<string, unknown> | undefined
  const labels = i.labels as Array<Record<string, unknown>> | undefined
  return {
    number: i.number,
    title: i.title,
    state: i.state ?? null,
    html_url: i.html_url ?? null,
    user_login: user?.login ?? null,
    labels: labels?.map(l => l.name ?? l) ?? [],
    created_at: i.created_at ?? null,
  }
}

function compactPR(p: Record<string, unknown>): Record<string, unknown> {
  const user = p.user as Record<string, unknown> | undefined
  const head = p.head as Record<string, unknown> | undefined
  const base = p.base as Record<string, unknown> | undefined
  return {
    number: p.number,
    title: p.title,
    state: p.state ?? null,
    html_url: p.html_url ?? null,
    user_login: user?.login ?? null,
    head_ref: head?.ref ?? null,
    base_ref: base?.ref ?? null,
  }
}

const REPO_ACTIONS = new Set(['list-repos', 'get-repo'])
const ISSUE_ACTIONS = new Set(['list-issues', 'get-issue'])
const PR_ACTIONS = new Set(['list-pull-requests', 'get-pull-request'])

export function shapeGitHubResponse(actionName: string, result: unknown): ShaperResult {
  if (typeof result !== 'object' || result === null) return passthrough(result)

  // GitHub list responses are arrays directly (not wrapped in { results: [] })
  if (Array.isArray(result)) {
    const items = result as Record<string, unknown>[]
    if (REPO_ACTIONS.has(actionName)) {
      const repos = items.map(compactRepo)
      const hasMore = items.length > 0 && items.length % 5 === 0 // heuristic
      return compacted(result, { results: repos, _compact: true, has_more: hasMore, next_cursor: null }, repos.length)
    }
    if (ISSUE_ACTIONS.has(actionName)) {
      const issues = items.map(compactIssue)
      const hasMore = items.length > 0 && items.length % 5 === 0
      return compacted(result, { results: issues, _compact: true, has_more: hasMore, next_cursor: null }, issues.length)
    }
    if (PR_ACTIONS.has(actionName)) {
      const prs = items.map(compactPR)
      const hasMore = items.length > 0 && items.length % 5 === 0
      return compacted(result, { results: prs, _compact: true, has_more: hasMore, next_cursor: null }, prs.length)
    }
    return passthrough(result)
  }

  const data = result as Record<string, unknown>

  // Single object responses
  if (REPO_ACTIONS.has(actionName) && data.id) return compacted(result, compactRepo(data), 1)
  if (ISSUE_ACTIONS.has(actionName) && data.number) return compacted(result, compactIssue(data), 1)
  if (PR_ACTIONS.has(actionName) && data.number) return compacted(result, compactPR(data), 1)

  return passthrough(result)
}
