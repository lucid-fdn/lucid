/**
 * Content Generation Tool
 *
 * Create content items (blog posts, social posts, newsletters, changelogs)
 * via a CMS REST API. Provider-agnostic — accepts API URL and key as config.
 */

export interface ContentConfig {
  apiUrl: string
  apiKey: string
  timeoutMs?: number
}

export interface ContentArgs {
  content_type: 'blog_post' | 'social_post' | 'newsletter' | 'changelog'
  title: string
  body: string
  excerpt?: string
  publish?: boolean
}

export interface ContentContext {
  tenantId?: string
  agentId?: string
}

const DEFAULT_CONTENT_API_TIMEOUT_MS = 15_000

/**
 * Create a content item via CMS API.
 *
 * @param args - Content parameters (type, title, body, etc.)
 * @param config - CMS API configuration (URL + key)
 * @param context - Optional tenant/agent context
 */
export async function toolGenerateContent(
  args: ContentArgs,
  config: ContentConfig,
  context?: ContentContext,
): Promise<string> {
  const { content_type, title, body, excerpt, publish = false } = args

  if (!title) return 'Error: "title" parameter is required'
  if (!body) return 'Error: "body" parameter is required'
  if (!config.apiUrl || !config.apiKey) {
    return 'Error: Content Studio not configured (missing API URL or API key)'
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  try {
    const timeoutMs = config.timeoutMs ?? DEFAULT_CONTENT_API_TIMEOUT_MS
    const res = await fetch(`${config.apiUrl}/content-api/content-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `payload-users API-Key ${config.apiKey}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        title,
        slug,
        body,
        excerpt: excerpt || '',
        contentType: content_type,
        status: publish ? 'published' : 'draft',
        createdByType: 'agent',
        createdByAgent: context?.agentId || 'unknown',
        tenant: context?.tenantId,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return `Error creating content: ${res.status} ${err}`
    }

    const item = (await res.json()) as { doc?: { id?: string } }
    const status = publish ? 'published' : 'draft'
    return `Content "${title}" created as ${status} (ID: ${item.doc?.id || 'unknown'}).${
      !publish ? ' Review it in Content Studio to publish.' : ''
    }`
  } catch (error) {
    const timeoutMs = config.timeoutMs ?? DEFAULT_CONTENT_API_TIMEOUT_MS
    const message = error instanceof Error && error.name === 'TimeoutError'
      ? `Content Studio request timed out after ${timeoutMs}ms`
      : error instanceof Error
        ? error.message
        : 'Unknown error'
    return `Error creating content: ${message}`
  }
}
