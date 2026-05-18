/**
 * Twitter/X Response Shaper — compacts tweets and users.
 */

import type { ShaperResult } from '../response-shaper.js'
import { compacted, passthrough, detectPagination } from '../response-shaper.js'

function compactTweet(t: Record<string, unknown>): Record<string, unknown> {
  const metrics = t.public_metrics as Record<string, unknown> | undefined
  return {
    id: t.id,
    text: t.text,
    created_at: t.created_at ?? null,
    author_id: t.author_id ?? null,
    like_count: metrics?.like_count ?? null,
    retweet_count: metrics?.retweet_count ?? null,
    reply_count: metrics?.reply_count ?? null,
  }
}

function compactTwitterUser(u: Record<string, unknown>): Record<string, unknown> {
  const metrics = u.public_metrics as Record<string, unknown> | undefined
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    verified: u.verified ?? false,
    followers_count: metrics?.followers_count ?? null,
    following_count: metrics?.following_count ?? null,
  }
}

const TWEET_LIST_ACTIONS = new Set([
  'search-tweets', 'get-user-tweets', 'get-mentions', 'get-bookmarks',
  'get-replies', 'get-liked-tweets',
])

const USER_LIST_ACTIONS = new Set([
  'get-followers', 'get-following', 'get-liking-users',
])

export function shapeTwitterResponse(actionName: string, result: unknown): ShaperResult {
  if (typeof result !== 'object' || result === null) return passthrough(result)
  const data = result as Record<string, unknown>
  const items = data.data as Record<string, unknown>[] | undefined

  if (TWEET_LIST_ACTIONS.has(actionName) && Array.isArray(items)) {
    const tweets = items.map(compactTweet)
    const pagination = detectPagination(data)
    return compacted(result, { results: tweets, _compact: true, ...pagination }, tweets.length)
  }

  if (USER_LIST_ACTIONS.has(actionName) && Array.isArray(items)) {
    const users = items.map(compactTwitterUser)
    const pagination = detectPagination(data)
    return compacted(result, { results: users, _compact: true, ...pagination }, users.length)
  }

  return passthrough(result)
}
