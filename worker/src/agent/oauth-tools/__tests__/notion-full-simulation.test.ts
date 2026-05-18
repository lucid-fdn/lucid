import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const BUILD_DIR = resolve(import.meta.dirname, '../../../../../nango-integrations/build')

type Call = {
  method: 'get' | 'post' | 'patch' | 'proxy'
  endpoint: string
  config: Record<string, unknown>
}

function loadScript(action: string) {
  const mod = require(resolve(BUILD_DIR, `notion_actions_${action}.cjs`))
  return mod.default || mod
}

function makeRichText(content: string) {
  return [{ type: 'text', text: { content }, plain_text: content }]
}

function makePageResponse(pageId = 'page-1') {
  return {
    id: pageId,
    object: 'page',
    created_time: '2026-04-21T10:00:00.000Z',
    last_edited_time: '2026-04-21T11:00:00.000Z',
    created_by: { object: 'user', id: 'user-1' },
    last_edited_by: { object: 'user', id: 'user-2' },
    parent: {
      type: 'page_id',
      page_id: 'parent-page-1',
      database_id: null,
      workspace: null,
    },
    archived: false,
    in_trash: false,
    properties: {
      title: { type: 'title', title: makeRichText('Sample Page') },
      Status: { type: 'select', select: { name: 'Active' } },
      Count: { type: 'number', number: 3 },
      Done: { type: 'checkbox', checkbox: true },
      Notes: { type: 'rich_text', rich_text: makeRichText('Some notes') },
      Due: { type: 'date', date: { start: '2026-04-22' } },
    },
    url: `https://notion.so/${pageId}`,
    public_url: null,
  }
}

function makeDatabaseResponse(databaseId = 'db-1') {
  return {
    id: databaseId,
    object: 'database',
    created_time: '2026-04-20T10:00:00.000Z',
    last_edited_time: '2026-04-21T11:00:00.000Z',
    title: makeRichText('Product Roadmap'),
    properties: {
      Name: { id: 'title', name: 'Name', type: 'title', title: {} },
      Status: { id: 'status', name: 'Status', type: 'select', select: { options: [] } },
    },
    url: `https://notion.so/${databaseId}`,
  }
}

function makeBlock(blockId = 'block-1', content = 'Hello block') {
  return {
    object: 'block',
    id: blockId,
    type: 'paragraph',
    paragraph: {
      rich_text: makeRichText(content),
    },
  }
}

function makeCommentsList() {
  return {
    object: 'list',
    results: [
      {
        id: 'comment-1',
        object: 'comment',
        created_time: '2026-04-21T09:00:00.000Z',
        rich_text: makeRichText('Looks good'),
      },
    ],
    has_more: false,
    next_cursor: null,
  }
}

function makeUsersList() {
  return {
    object: 'list',
    results: [
      {
        object: 'user',
        id: 'user-1',
        name: 'Kevin Wayne',
        type: 'person',
        person: { email: 'kevin@example.com' },
      },
    ],
    has_more: false,
    next_cursor: null,
  }
}

function makeQueryResults() {
  return {
    object: 'list',
    results: [makePageResponse('page-from-db-1')],
    has_more: true,
    next_cursor: 'cursor-next',
  }
}

function makeSearchResults() {
  return {
    object: 'list',
    results: [makePageResponse('page-search-1')],
    has_more: false,
    next_cursor: null,
  }
}

function makeBlockChildrenResults() {
  return {
    object: 'list',
    results: [makeBlock('child-block-1', 'Nested block')],
    has_more: false,
    next_cursor: null,
  }
}

function createNotionSimulationAdapter() {
  const calls: Call[] = []

  const adapter = {
    get: async (config: Record<string, unknown>) => {
      const endpoint = String(config.endpoint)
      calls.push({ method: 'get', endpoint, config })

      if (endpoint === 'v1/comments') return { data: makeCommentsList() }
      if (endpoint === 'v1/users') return { data: makeUsersList() }
      if (endpoint === 'v1/databases/db-1') return { data: makeDatabaseResponse('db-1') }
      if (endpoint === 'v1/pages/page-1') return { data: makePageResponse('page-1') }
      if (endpoint === 'v1/blocks/block-1/children') return { data: makeBlockChildrenResults() }

      throw new Error(`Unhandled GET endpoint in Notion simulation: ${endpoint}`)
    },
    post: async (config: Record<string, unknown>) => {
      const endpoint = String(config.endpoint)
      calls.push({ method: 'post', endpoint, config })

      if (endpoint === 'v1/comments') {
        return {
          data: {
            id: 'comment-1',
            object: 'comment',
            created_time: '2026-04-21T09:00:00.000Z',
            rich_text: config.data && typeof config.data === 'object' ? (config.data as any).rich_text : [],
          },
        }
      }

      if (endpoint === 'v1/pages') return { data: makePageResponse('new-page-1') }
      if (endpoint === 'v1/databases/db-1/query') return { data: makeQueryResults() }
      if (endpoint === 'v1/search') return { data: makeSearchResults() }

      throw new Error(`Unhandled POST endpoint in Notion simulation: ${endpoint}`)
    },
    patch: async (config: Record<string, unknown>) => {
      const endpoint = String(config.endpoint)
      calls.push({ method: 'patch', endpoint, config })

      if (endpoint === 'v1/blocks/block-1/children') return { data: makeBlockChildrenResults() }

      if (endpoint === 'v1/pages/page-1') {
        const data = makePageResponse('page-1')
        const body = ((config.data as Record<string, unknown> | undefined) ?? {})
        if (body.archived === true) data.archived = true
        return { data }
      }

      throw new Error(`Unhandled PATCH endpoint in Notion simulation: ${endpoint}`)
    },
    proxy: async (config: Record<string, unknown>) => {
      const endpoint = String(config.endpoint)
      calls.push({ method: 'proxy', endpoint, config })

      if (endpoint === '/v1/pages/page-1') return { data: makePageResponse('page-1') }
      if (endpoint === '/v1/blocks/page-1/children') return { data: makeBlockChildrenResults() }

      throw new Error(`Unhandled PROXY endpoint in Notion simulation: ${endpoint}`)
    },
    log: () => {},
  }

  return { adapter, calls }
}

const CASES = [
  {
    action: 'append-block-children',
    input: {
      block_id: 'block-1',
      children: [makeBlock('child-block-1', 'Appended block')],
      after: 'block-0',
    },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('patch')
      expect(calls[0].endpoint).toBe('v1/blocks/block-1/children')
    },
  },
  {
    action: 'archive-page',
    input: { page_id: 'page-1' },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('patch')
      expect(calls[0].endpoint).toBe('v1/pages/page-1')
      expect((calls[0].config.data as Record<string, unknown>).archived).toBe(true)
    },
  },
  {
    action: 'create-comment',
    input: {
      parent: { page_id: 'page-1' },
      rich_text: makeRichText('A useful comment'),
      discussion_id: 'discussion-1',
    },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('post')
      expect(calls[0].endpoint).toBe('v1/comments')
    },
  },
  {
    action: 'create-page',
    input: {
      parent: { page_id: 'parent-page-1' },
      properties: {
        title: { title: makeRichText('Fresh page') },
      },
      children: [makeBlock('child-block-1', 'Body')],
      icon: { type: 'emoji', emoji: '📄' },
      cover: { type: 'external', external: { url: 'https://example.com/cover.png' } },
    },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('post')
      expect(calls[0].endpoint).toBe('v1/pages')
    },
  },
  {
    action: 'get-page',
    input: { page_id: 'page-1' },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(2)
      expect(calls.map((call) => call.method)).toEqual(['proxy', 'proxy'])
      expect(calls.map((call) => call.endpoint)).toEqual(['/v1/pages/page-1', '/v1/blocks/page-1/children'])
    },
  },
  {
    action: 'list-comments',
    input: { block_id: 'block-1', page_size: 10, cursor: 'cursor-1' },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('get')
      expect(calls[0].endpoint).toBe('v1/comments')
    },
  },
  {
    action: 'list-users',
    input: { page_size: 10, cursor: 'cursor-1' },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('get')
      expect(calls[0].endpoint).toBe('v1/users')
    },
  },
  {
    action: 'query-database',
    input: {
      database_id: 'db-1',
      filter: { property: 'Status', select: { equals: 'Active' } },
      sorts: [{ property: 'Name', direction: 'ascending' }],
      page_size: 10,
      cursor: 'cursor-1',
    },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('post')
      expect(calls[0].endpoint).toBe('v1/databases/db-1/query')
    },
  },
  {
    action: 'retrieve-block-children',
    input: { block_id: 'block-1', page_size: 10, cursor: 'cursor-1' },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('get')
      expect(calls[0].endpoint).toBe('v1/blocks/block-1/children')
    },
  },
  {
    action: 'retrieve-database',
    input: { database_id: 'db-1' },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('get')
      expect(calls[0].endpoint).toBe('v1/databases/db-1')
    },
  },
  {
    action: 'retrieve-page',
    input: { page_id: 'page-1' },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('get')
      expect(calls[0].endpoint).toBe('v1/pages/page-1')
    },
  },
  {
    action: 'search-pages',
    input: { query: 'sample page', page_size: 10, cursor: 'cursor-1' },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('post')
      expect(calls[0].endpoint).toBe('v1/search')
    },
  },
  {
    action: 'update-page',
    input: {
      page_id: 'page-1',
      properties: { Status: { select: { name: 'Done' } } },
      icon: { type: 'emoji', emoji: '✅' },
      cover: { type: 'external', external: { url: 'https://example.com/done.png' } },
      archived: false,
    },
    verify(calls: Call[]) {
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('patch')
      expect(calls[0].endpoint).toBe('v1/pages/page-1')
    },
  },
] as const

describe('Notion full simulation', () => {
  it('covers the full Notion action surface', () => {
    expect(CASES).toHaveLength(13)
  })

  it.each(CASES)('$action executes with realistic mocked Notion responses', async ({ action, input, verify }) => {
    const script = loadScript(action)
    const { adapter, calls } = createNotionSimulationAdapter()

    const parsedInput = script.input.parse(input)
    const result = await script.exec(adapter, parsedInput)

    expect(() => script.output.parse(result)).not.toThrow()
    verify(calls)
  })
})
