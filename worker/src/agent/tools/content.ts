/**
 * Content Studio Tool
 * Create content items (blog posts, social posts, newsletters, changelogs)
 * via Payload CMS REST API
 */

import { sanitizeToolError } from './tx-error-translator.js'

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL || ''
const PAYLOAD_API_KEY = process.env.PAYLOAD_API_KEY || ''

interface ContentArgs {
  content_type: 'blog_post' | 'social_post' | 'newsletter' | 'changelog'
  title: string
  body: string
  excerpt?: string
  publish?: boolean
}

interface ContentContext {
  tenantId?: string
  agentId?: string
}

export async function toolGenerateContent(
  args: ContentArgs,
  context?: ContentContext,
): Promise<string> {
  const { content_type, title, body, excerpt, publish = false } = args

  if (!title) {
    return 'Error: "title" parameter is required'
  }
  if (!body) {
    return 'Error: "body" parameter is required'
  }

  if (!PAYLOAD_API_URL || !PAYLOAD_API_KEY) {
    return 'Error: Content Studio not configured (missing PAYLOAD_API_URL or PAYLOAD_API_KEY)'
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  console.log('[Content] Creating content:', { content_type, title, slug, publish })

  try {
    const res = await fetch(`${PAYLOAD_API_URL}/content-api/content-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `payload-users API-Key ${PAYLOAD_API_KEY}`,
      },
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
    console.error('[Content] Error:', error)
    return `Error creating content: ${sanitizeToolError(error)}`
  }
}
