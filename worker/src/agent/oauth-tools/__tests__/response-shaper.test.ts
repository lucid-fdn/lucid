import { describe, it, expect } from 'vitest'
import { applyDefaultPageSize, shapeActionResponse, detectPagination } from '../response-shaper.js'

/* ═══════════════════════════════════════════════════════════════
   Default Page Sizes
   ═══════════════════════════════════════════════════════════════ */

describe('applyDefaultPageSize', () => {
  it('returns unchanged args when page_size already set', () => {
    const args = { query: 'test', page_size: 50 }
    const result = applyDefaultPageSize('notion', 'search-pages', args)
    expect(result).toBe(args) // same reference — not cloned
    expect(result.page_size).toBe(50)
  })

  it('returns unchanged args when page_size is 0 (falsy but not null/undefined)', () => {
    const args = { query: 'test', page_size: 0 }
    const result = applyDefaultPageSize('notion', 'search-pages', args)
    expect(result).toBe(args)
    expect(result.page_size).toBe(0)
  })

  it('injects default for notion:search-pages → 10', () => {
    const args = { query: 'meeting notes' }
    const result = applyDefaultPageSize('notion', 'search-pages', args)
    expect(result.page_size).toBe(10)
    expect(result.query).toBe('meeting notes')
    expect(result).not.toBe(args) // new object
  })

  it('injects default for slack:list-channels → 20', () => {
    const result = applyDefaultPageSize('slack', 'list-channels', {})
    expect(result.page_size).toBe(20)
  })

  it('injects default for notion:query-database → 15', () => {
    const result = applyDefaultPageSize('notion', 'query-database', { database_id: 'db-1' })
    expect(result.page_size).toBe(15)
    expect(result.database_id).toBe('db-1')
  })

  it('injects the same default for notion:search alias', () => {
    const result = applyDefaultPageSize('notion', 'search', {})
    expect(result.page_size).toBe(10)
  })

  it('injects default for notion:list-users → 20', () => {
    const result = applyDefaultPageSize('notion', 'list-users', {})
    expect(result.page_size).toBe(20)
  })

  it('injects default for notion:retrieve-block-children → 20', () => {
    const result = applyDefaultPageSize('notion', 'retrieve-block-children', { block_id: 'b1' })
    expect(result.page_size).toBe(20)
  })

  it('injects default for notion:list-comments → 15', () => {
    const result = applyDefaultPageSize('notion', 'list-comments', { block_id: 'b1' })
    expect(result.page_size).toBe(15)
  })

  it('injects default for slack:list-messages → 15', () => {
    const result = applyDefaultPageSize('slack', 'list-messages', { channel: 'C123' })
    expect(result.page_size).toBe(15)
  })

  it('injects default for google:list-events → 15', () => {
    const result = applyDefaultPageSize('google', 'list-events', {})
    expect(result.page_size).toBe(15)
  })

  it('injects default for google:list-files → 15', () => {
    const result = applyDefaultPageSize('google', 'list-files', {})
    expect(result.page_size).toBe(15)
  })

  it('returns unchanged for unknown provider', () => {
    const args = { query: 'test' }
    const result = applyDefaultPageSize('unknown-provider', 'some-action', args)
    expect(result).toBe(args)
  })

  it('returns unchanged for unknown action on known provider', () => {
    const args = { id: '123' }
    const result = applyDefaultPageSize('notion', 'get-page', args)
    expect(result).toBe(args)
  })

  it('does not mutate original args object', () => {
    const args = { query: 'test' }
    const returned = applyDefaultPageSize('notion', 'search-pages', args)
    expect(args).not.toHaveProperty('page_size')
    // returned is a separate object with page_size
    expect(returned.page_size).toBe(10)
  })

  it('preserves all existing properties in returned object', () => {
    const args = { query: 'test', filter: { property: 'Status' }, sorts: [{ direction: 'ascending' }] }
    const result = applyDefaultPageSize('notion', 'query-database', args)
    expect(result.query).toBe('test')
    expect(result.filter).toBe(args.filter)
    expect(result.sorts).toBe(args.sorts)
    expect(result.page_size).toBe(15)
  })
})

/* ═══════════════════════════════════════════════════════════════
   Notion compaction: search-pages / query-database
   ═══════════════════════════════════════════════════════════════ */

/** Realistic Notion page object with properties, cover, icon, etc. */
function makeNotionPage(
  id: string,
  title: string,
  overrides?: Partial<Record<string, unknown>>,
) {
  return {
    object: 'page',
    id,
    created_time: '2026-01-01T00:00:00.000Z',
    last_edited_time: '2026-03-01T00:00:00.000Z',
    created_by: { object: 'user', id: 'user-creator' },
    last_edited_by: { object: 'user', id: 'user-editor' },
    archived: false,
    in_trash: false,
    url: `https://notion.so/${id}`,
    public_url: null,
    parent: { type: 'workspace', workspace: true },
    icon: { type: 'emoji', emoji: '📄' },
    cover: { type: 'external', external: { url: 'https://example.com/cover.png' } },
    properties: {
      Name: {
        id: 'title',
        type: 'title',
        title: [
          {
            type: 'text',
            text: { content: title, link: null },
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
            plain_text: title,
            href: null,
          },
        ],
      },
      Status: {
        id: 'status',
        type: 'select',
        select: { id: 's1', name: 'Active', color: 'green' },
      },
      Tags: {
        id: 'tags',
        type: 'multi_select',
        multi_select: [
          { id: 't1', name: 'Engineering', color: 'blue' },
          { id: 't2', name: 'Urgent', color: 'red' },
        ],
      },
      'Created Date': {
        id: 'created',
        type: 'date',
        date: { start: '2026-01-01', end: null, time_zone: null },
      },
      Assignee: {
        id: 'assignee',
        type: 'people',
        people: [{ object: 'user', id: 'user-1', name: 'Alice' }],
      },
    },
    ...overrides,
  }
}

describe('shapeActionResponse — Notion search-pages', () => {
  it('compacts search-pages results to id/title/url/parent/timestamps', () => {
    const result = {
      object: 'list',
      results: [makeNotionPage('page-1', 'Meeting Notes'), makeNotionPage('page-2', 'Design Doc')],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'search-pages', result)

    expect(shaped.compacted).toBe(true)
    expect(shaped.shaped).toMatchObject({
      object: 'list',
      _compact: true,
      _hint: expect.stringContaining('get-page'),
      has_more: false,
      next_cursor: null,
      results: [
        {
          id: 'page-1',
          object: 'page',
          title: 'Meeting Notes',
          url: expect.stringContaining('page-1'),
          parent: 'workspace',
          created_time: '2026-01-01T00:00:00.000Z',
          last_edited_time: '2026-03-01T00:00:00.000Z',
          archived: false,
          icon: 'emoji',
        },
        {
          id: 'page-2',
          object: 'page',
          title: 'Design Doc',
          url: expect.stringContaining('page-2'),
          parent: 'workspace',
        },
      ],
    })
  })

  it('compacts notion:search using the local search-pages alias', () => {
    const result = {
      object: 'list',
      results: [makeNotionPage('page-1', 'Meeting Notes')],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'search', result)

    expect(shaped.compacted).toBe(true)
    expect(shaped.shaped).toMatchObject({
      object: 'list',
      _compact: true,
      results: [
        {
          id: 'page-1',
          object: 'page',
          title: 'Meeting Notes',
        },
      ],
    })
  })

  it('strips cover, created_by, last_edited_by, annotations, and deep property trees', () => {
    const result = {
      object: 'list',
      results: [makeNotionPage('page-1', 'Test')],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const page = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]

    // These fields from the original should NOT be in the compacted version
    expect(page).not.toHaveProperty('cover')
    expect(page).not.toHaveProperty('created_by')
    expect(page).not.toHaveProperty('last_edited_by')
    expect(page).not.toHaveProperty('properties')
    expect(page).not.toHaveProperty('in_trash')
    expect(page).not.toHaveProperty('public_url')

    // These essential fields SHOULD be present
    expect(page).toHaveProperty('id')
    expect(page).toHaveProperty('object')
    expect(page).toHaveProperty('title')
    expect(page).toHaveProperty('url')
    expect(page).toHaveProperty('parent')
    expect(page).toHaveProperty('created_time')
    expect(page).toHaveProperty('last_edited_time')
    expect(page).toHaveProperty('archived')
    expect(page).toHaveProperty('icon')
  })

  it('extracts title from first property with type=title', () => {
    const page = makeNotionPage('p1', 'My Title')
    const result = { object: 'list', results: [page], has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const compactedPage = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(compactedPage.title).toBe('My Title')
  })

  it('joins multi-segment title rich_text into single string', () => {
    const page = makeNotionPage('p1', '', {
      properties: {
        Title: {
          id: 'title',
          type: 'title',
          title: [
            { plain_text: 'Hello ' },
            { plain_text: 'World' },
            { plain_text: '!' },
          ],
        },
      },
    })
    const result = { object: 'list', results: [page], has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const compactedPage = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(compactedPage.title).toBe('Hello World!')
  })

  it('returns (untitled) when no title property exists', () => {
    const page = makeNotionPage('p1', '', {
      properties: {
        Status: { id: 'status', type: 'select', select: { name: 'Active' } },
      },
    })
    const result = { object: 'list', results: [page], has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const compactedPage = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(compactedPage.title).toBe('(untitled)')
  })

  it('returns (untitled) when properties is missing entirely', () => {
    const page = { object: 'page', id: 'p1', url: 'https://notion.so/p1' }
    const result = { object: 'list', results: [page], has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const compactedPage = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(compactedPage.title).toBe('(untitled)')
  })

  it('returns (untitled) when title array is empty', () => {
    const page = makeNotionPage('p1', '', {
      properties: {
        Name: { id: 'title', type: 'title', title: [] },
      },
    })
    const result = { object: 'list', results: [page], has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const compactedPage = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(compactedPage.title).toBe('(untitled)')
  })

  it('extracts database_id parent', () => {
    const page = makeNotionPage('p1', 'In DB', {
      parent: { type: 'database_id', database_id: 'db-abc-123' },
    })
    const result = { object: 'list', results: [page], has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const compactedPage = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(compactedPage.parent).toBe('database:db-abc-123')
  })

  it('extracts page_id parent', () => {
    const page = makeNotionPage('p1', 'Subpage', {
      parent: { type: 'page_id', page_id: 'parent-page-456' },
    })
    const result = { object: 'list', results: [page], has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const compactedPage = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(compactedPage.parent).toBe('page:parent-page-456')
  })

  it('extracts workspace parent', () => {
    const page = makeNotionPage('p1', 'Top-level', {
      parent: { type: 'workspace', workspace: true },
    })
    const result = { object: 'list', results: [page], has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const compactedPage = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(compactedPage.parent).toBe('workspace')
  })

  it('returns null parent when parent is missing', () => {
    const page = { object: 'page', id: 'p1', url: 'u', properties: {} }
    const result = { object: 'list', results: [page], has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const compactedPage = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(compactedPage.parent).toBeNull()
  })

  it('returns null parent for unknown parent type', () => {
    const page = makeNotionPage('p1', 'X', {
      parent: { type: 'block_id', block_id: 'blk-1' },
    })
    const result = { object: 'list', results: [page], has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const compactedPage = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(compactedPage.parent).toBeNull()
  })

  it('extracts icon type (emoji vs external)', () => {
    const emojiPage = makeNotionPage('p1', 'Emoji', { icon: { type: 'emoji', emoji: '🔥' } })
    const externalPage = makeNotionPage('p2', 'External', { icon: { type: 'external', external: { url: 'https://icon.png' } } })
    const noIconPage = makeNotionPage('p3', 'None', { icon: null })

    const result = { object: 'list', results: [emojiPage, externalPage, noIconPage], has_more: false, next_cursor: null }
    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const pages = (shaped.shaped as { results: Record<string, unknown>[] }).results

    expect(pages[0].icon).toBe('emoji')
    expect(pages[1].icon).toBe('external')
    expect(pages[2].icon).toBeNull()
  })

  it('sets archived to false when page.archived is falsy', () => {
    const page = makeNotionPage('p1', 'X', { archived: undefined })
    const result = { object: 'list', results: [page], has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const compactedPage = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(compactedPage.archived).toBe(false)
  })

  it('preserves has_more and next_cursor for pagination', () => {
    const result = {
      object: 'list',
      results: [makeNotionPage('p1', 'Page 1')],
      has_more: true,
      next_cursor: 'cursor-abc-123',
    }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const data = shaped.shaped as Record<string, unknown>
    expect(data.has_more).toBe(true)
    expect(data.next_cursor).toBe('cursor-abc-123')
  })

  it('sets next_cursor to null when missing from original', () => {
    const result = {
      object: 'list',
      results: [makeNotionPage('p1', 'Page 1')],
      has_more: false,
      // next_cursor intentionally omitted
    }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const data = shaped.shaped as Record<string, unknown>
    expect(data.next_cursor).toBeNull()
  })

  it('handles empty results array', () => {
    const result = { object: 'list', results: [], has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    expect(shaped.compacted).toBe(true)
    expect(shaped.resultCount).toBe(0)
    const data = shaped.shaped as { results: unknown[] }
    expect(data.results).toEqual([])
  })

  it('achieves >50% reduction on realistic page objects', () => {
    const pages = Array.from({ length: 5 }, (_, i) => makeNotionPage(`page-${i}`, `Document ${i}`))
    const result = { object: 'list', results: pages, has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    expect(shaped.compacted).toBe(true)
    expect(shaped.shapedChars).toBeLessThan(shaped.originalChars * 0.5)
  })
})

describe('shapeActionResponse — Notion query-database', () => {
  it('compacts query-database results identically to search-pages', () => {
    const result = {
      object: 'list',
      results: [makeNotionPage('page-1', 'Task A'), makeNotionPage('page-2', 'Task B')],
      has_more: true,
      next_cursor: 'qd-cursor',
    }

    const shaped = shapeActionResponse('notion', 'query-database', result)

    expect(shaped.compacted).toBe(true)
    expect(shaped.resultCount).toBe(2)
    const data = shaped.shaped as { results: Record<string, unknown>[]; has_more: boolean; next_cursor: string }
    expect(data.results[0].title).toBe('Task A')
    expect(data.results[1].title).toBe('Task B')
    expect(data.has_more).toBe(true)
    expect(data.next_cursor).toBe('qd-cursor')
  })
})

/* ═══════════════════════════════════════════════════════════════
   Notion compaction: list-users
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — Notion list-users', () => {
  it('compacts users to id/object/name/type/avatar_url', () => {
    const result = {
      object: 'list',
      results: [
        {
          object: 'user',
          id: 'user-1',
          name: 'Alice',
          type: 'person',
          avatar_url: 'https://example.com/alice.png',
          person: { email: 'alice@example.com' },
        },
        {
          object: 'user',
          id: 'user-2',
          name: 'Bot',
          type: 'bot',
          avatar_url: null,
          bot: { owner: { type: 'workspace' }, workspace_name: 'Test' },
        },
      ],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'list-users', result)
    expect(shaped.compacted).toBe(true)

    const data = shaped.shaped as { results: Array<Record<string, unknown>> }
    expect(data.results).toHaveLength(2)
    expect(data.results[0]).toEqual({
      id: 'user-1',
      object: 'user',
      name: 'Alice',
      type: 'person',
      avatar_url: 'https://example.com/alice.png',
    })
    expect(data.results[1]).toEqual({
      id: 'user-2',
      object: 'user',
      name: 'Bot',
      type: 'bot',
      avatar_url: null,
    })
  })

  it('strips person.email and bot details from compacted users', () => {
    const result = {
      object: 'list',
      results: [
        {
          object: 'user',
          id: 'u1',
          name: 'Alice',
          type: 'person',
          avatar_url: 'https://example.com/a.png',
          person: { email: 'alice@example.com' },
          request_id: 'req-123',
        },
      ],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'list-users', result)
    const user = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(user).not.toHaveProperty('person')
    expect(user).not.toHaveProperty('request_id')
  })

  it('handles missing avatar_url (undefined becomes null)', () => {
    const result = {
      object: 'list',
      results: [
        { object: 'user', id: 'u1', name: 'NoAvatar', type: 'person' },
      ],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'list-users', result)
    const user = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(user.avatar_url).toBeNull()
  })
})

/* ═══════════════════════════════════════════════════════════════
   Notion compaction: retrieve-block-children
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — Notion retrieve-block-children', () => {
  it('compacts blocks to id/type/text/has_children', () => {
    const result = {
      object: 'list',
      results: [
        {
          object: 'block',
          id: 'block-1',
          type: 'paragraph',
          has_children: false,
          created_time: '2026-01-01T00:00:00.000Z',
          last_edited_time: '2026-03-01T00:00:00.000Z',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: 'Hello world' }, plain_text: 'Hello world', annotations: { bold: false } },
            ],
            color: 'default',
          },
        },
        {
          object: 'block',
          id: 'block-2',
          type: 'heading_1',
          has_children: true,
          heading_1: {
            rich_text: [{ type: 'text', plain_text: 'Section Title' }],
            is_toggleable: false,
            color: 'default',
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'retrieve-block-children', result)
    expect(shaped.compacted).toBe(true)

    const data = shaped.shaped as { results: Array<Record<string, unknown>> }
    expect(data.results[0]).toEqual({
      id: 'block-1',
      type: 'paragraph',
      has_children: false,
      text: 'Hello world',
    })
    expect(data.results[1]).toMatchObject({
      id: 'block-2',
      type: 'heading_1',
      has_children: true,
      text: 'Section Title',
    })
  })

  it('handles blocks without rich_text (e.g., divider, table_of_contents)', () => {
    const result = {
      object: 'list',
      results: [
        {
          object: 'block',
          id: 'block-div',
          type: 'divider',
          has_children: false,
          divider: {},
        },
        {
          object: 'block',
          id: 'block-toc',
          type: 'table_of_contents',
          has_children: false,
          table_of_contents: { color: 'default' },
        },
      ],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'retrieve-block-children', result)
    const data = shaped.shaped as { results: Array<Record<string, unknown>> }

    expect(data.results[0]).toEqual({
      id: 'block-div',
      type: 'divider',
      has_children: false,
    })
    expect(data.results[1]).toEqual({
      id: 'block-toc',
      type: 'table_of_contents',
      has_children: false,
    })
    // No text property should exist
    expect(data.results[0]).not.toHaveProperty('text')
    expect(data.results[1]).not.toHaveProperty('text')
  })

  it('extracts url from bookmark and embed blocks', () => {
    const result = {
      object: 'list',
      results: [
        {
          object: 'block',
          id: 'block-bookmark',
          type: 'bookmark',
          has_children: false,
          bookmark: {
            url: 'https://example.com/article',
            caption: [{ plain_text: 'An article' }],
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'retrieve-block-children', result)
    const block = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]

    expect(block.url).toBe('https://example.com/article')
    expect(block.caption).toBe('An article')
  })

  it('extracts caption from image blocks', () => {
    const result = {
      object: 'list',
      results: [
        {
          object: 'block',
          id: 'block-img',
          type: 'image',
          has_children: false,
          image: {
            type: 'external',
            external: { url: 'https://example.com/photo.jpg' },
            caption: [
              { plain_text: 'A ' },
              { plain_text: 'nice photo' },
            ],
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'retrieve-block-children', result)
    const block = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]

    expect(block.caption).toBe('A nice photo')
  })

  it('joins multi-segment rich_text in blocks', () => {
    const result = {
      object: 'list',
      results: [
        {
          object: 'block',
          id: 'block-multi',
          type: 'paragraph',
          has_children: false,
          paragraph: {
            rich_text: [
              { plain_text: 'Part one. ' },
              { plain_text: 'Part two.' },
            ],
            color: 'default',
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'retrieve-block-children', result)
    const block = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(block.text).toBe('Part one. Part two.')
  })

  it('defaults has_children to false when missing', () => {
    const result = {
      object: 'list',
      results: [
        {
          object: 'block',
          id: 'block-no-children-field',
          type: 'paragraph',
          paragraph: { rich_text: [{ plain_text: 'text' }] },
          // has_children intentionally omitted
        },
      ],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'retrieve-block-children', result)
    const block = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(block.has_children).toBe(false)
  })

  it('handles block with no type-specific content key', () => {
    const result = {
      object: 'list',
      results: [
        {
          object: 'block',
          id: 'block-unsupported',
          type: 'unsupported',
          has_children: false,
          // No 'unsupported' key present
        },
      ],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'retrieve-block-children', result)
    const block = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    expect(block).toEqual({
      id: 'block-unsupported',
      type: 'unsupported',
      has_children: false,
    })
  })
})

/* ═══════════════════════════════════════════════════════════════
   Notion compaction: retrieve-database
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — Notion retrieve-database', () => {
  it('compacts database to id/title/url/timestamps/properties as name→type map', () => {
    const result = {
      object: 'database',
      id: 'db-1',
      title: [{ type: 'text', plain_text: 'Task Tracker' }],
      description: [{ type: 'text', plain_text: 'All project tasks' }],
      url: 'https://notion.so/db-1',
      created_time: '2026-01-01T00:00:00.000Z',
      last_edited_time: '2026-03-01T00:00:00.000Z',
      icon: { type: 'emoji', emoji: '📋' },
      cover: null,
      is_inline: false,
      archived: false,
      in_trash: false,
      parent: { type: 'workspace', workspace: true },
      properties: {
        Name: { id: 'title', type: 'title', title: {} },
        Status: { id: 'status', type: 'select', select: { options: [{ name: 'Active' }, { name: 'Done' }] } },
        Priority: { id: 'priority', type: 'number', number: { format: 'number' } },
        Tags: { id: 'tags', type: 'multi_select', multi_select: { options: [] } },
        Assignee: { id: 'assignee', type: 'people', people: {} },
        Due: { id: 'due', type: 'date', date: {} },
      },
    }

    const shaped = shapeActionResponse('notion', 'retrieve-database', result)
    expect(shaped.compacted).toBe(true)
    expect(shaped.resultCount).toBe(1)

    const data = shaped.shaped as Record<string, unknown>
    expect(data.id).toBe('db-1')
    expect(data.object).toBe('database')
    expect(data.title).toBe('Task Tracker')
    expect(data.url).toBe('https://notion.so/db-1')
    expect(data.created_time).toBe('2026-01-01T00:00:00.000Z')
    expect(data.last_edited_time).toBe('2026-03-01T00:00:00.000Z')
    expect(data.properties).toEqual({
      Name: 'title',
      Status: 'select',
      Priority: 'number',
      Tags: 'multi_select',
      Assignee: 'people',
      Due: 'date',
    })

    // Stripped fields
    expect(data).not.toHaveProperty('description')
    expect(data).not.toHaveProperty('icon')
    expect(data).not.toHaveProperty('cover')
    expect(data).not.toHaveProperty('is_inline')
    expect(data).not.toHaveProperty('archived')
    expect(data).not.toHaveProperty('parent')
  })

  it('joins multi-segment database title', () => {
    const result = {
      object: 'database',
      id: 'db-2',
      title: [{ plain_text: 'My ' }, { plain_text: 'Database' }],
      properties: {},
    }

    const shaped = shapeActionResponse('notion', 'retrieve-database', result)
    const data = shaped.shaped as Record<string, unknown>
    expect(data.title).toBe('My Database')
  })

  it('returns (untitled) when title is not an array', () => {
    const result = {
      object: 'database',
      id: 'db-3',
      title: null,
      properties: {},
    }

    const shaped = shapeActionResponse('notion', 'retrieve-database', result)
    const data = shaped.shaped as Record<string, unknown>
    expect(data.title).toBe('(untitled)')
  })

  it('returns empty properties map when properties is missing', () => {
    const result = {
      object: 'database',
      id: 'db-4',
      title: [{ plain_text: 'Test' }],
      // properties intentionally omitted
    }

    const shaped = shapeActionResponse('notion', 'retrieve-database', result)
    const data = shaped.shaped as Record<string, unknown>
    expect(data.properties).toEqual({})
  })
})

/* ═══════════════════════════════════════════════════════════════
   Provider Router
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — provider router', () => {
  it('routes Notion results through Notion shaper', () => {
    const result = {
      object: 'list',
      results: [{ object: 'user', id: 'u1', name: 'A', type: 'person' }],
      has_more: false,
      next_cursor: null,
    }
    const shaped = shapeActionResponse('notion', 'list-users', result)
    expect(shaped.compacted).toBe(true)
  })

  it('passes through unknown providers unchanged (compacted=false)', () => {
    const result = { data: [1, 2, 3] }
    const shaped = shapeActionResponse('unknown-xyz', 'list-repos', result)
    expect(shaped.compacted).toBe(false)
    expect(shaped.shaped).toBe(result) // same reference
    expect(shaped.originalChars).toBe(0)
    expect(shaped.shapedChars).toBe(0)
  })

  it('compacts slack list-channels results', () => {
    const result = { channels: [{ id: 'C1', name: 'general', topic: { value: 'General chat' }, purpose: { value: 'Main channel' }, num_members: 50, is_archived: false, extra: 'data' }] }
    const shaped = shapeActionResponse('slack', 'list-channels', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).toMatchObject({ id: 'C1', name: 'general' })
  })

  it('compacts google list-events results', () => {
    const result = { items: [{ id: 'evt1', summary: 'Meeting', start: { dateTime: '2026-01-01T10:00:00Z' }, end: { dateTime: '2026-01-01T11:00:00Z' }, status: 'confirmed', htmlLink: 'https://cal.google.com/evt1' }] }
    const shaped = shapeActionResponse('google', 'list-events', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).toMatchObject({ id: 'evt1', summary: 'Meeting' })
  })

  it('passes through unknown Notion actions with results[] unchanged', () => {
    const result = {
      object: 'list',
      results: [{ id: '1', custom: true }],
      has_more: false,
      next_cursor: null,
    }
    const shaped = shapeActionResponse('notion', 'some-future-action', result)
    expect(shaped.compacted).toBe(false)
    expect(shaped.shaped).toBe(result)
  })

  it('reports correct originalChars and shapedChars for compacted results', () => {
    const makeUser = (id: string, name: string) => ({
      object: 'user', id, name, type: 'person',
      avatar_url: `https://example.com/${id}.png`,
      person: { email: `${name.toLowerCase()}@example.com` },
      bot: null,
      request_id: `req-${id}-abcdef`,
    })
    const result = {
      object: 'list',
      results: Array.from({ length: 5 }, (_, i) => makeUser(`user-${i}`, `User${i}`)),
      has_more: false,
      next_cursor: null,
      type: 'user',
      request_id: 'req-abc-123-def-456',
    }

    const shaped = shapeActionResponse('notion', 'list-users', result)
    expect(shaped.compacted).toBe(true)
    expect(shaped.originalChars).toBeGreaterThan(shaped.shapedChars)
    expect(shaped.originalChars).toBe(JSON.stringify(result).length)
    expect(shaped.shapedChars).toBe(JSON.stringify(shaped.shaped).length)
  })

  it('passthrough has 0 for originalChars and shapedChars', () => {
    const shaped = shapeActionResponse('unknown-xyz', 'list-contacts', { contacts: [] })
    expect(shaped.originalChars).toBe(0)
    expect(shaped.shapedChars).toBe(0)
  })
})

/* ═══════════════════════════════════════════════════════════════
   _compact marker and _hint
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — compact markers', () => {
  it('adds _compact: true and _hint to shaped list results', () => {
    const result = {
      object: 'list',
      results: [{ object: 'user', id: 'u1', name: 'A', type: 'person' }],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'list-users', result)
    const data = shaped.shaped as Record<string, unknown>
    expect(data._compact).toBe(true)
    expect(data._hint).toMatch(/get-page|retrieve-page/)
  })

  it('does not add _compact to passthrough results', () => {
    const shaped = shapeActionResponse('unknown-xyz', 'list-repos', { repos: [] })
    const data = shaped.shaped as Record<string, unknown>
    expect(data).not.toHaveProperty('_compact')
    expect(data).not.toHaveProperty('_hint')
  })
})

/* ═══════════════════════════════════════════════════════════════
   Serialization efficiency
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — serialization', () => {
  it('provides pre-serialized string for compacted results', () => {
    const result = {
      object: 'list',
      results: [{ object: 'user', id: 'u1', name: 'A', type: 'person', avatar_url: null }],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'list-users', result)
    expect(shaped.compacted).toBe(true)
    expect(shaped.serialized).toBeDefined()
    expect(shaped.serialized).toBe(JSON.stringify(shaped.shaped))
  })

  it('serialized string is valid JSON that round-trips to shaped', () => {
    const result = {
      object: 'list',
      results: [makeNotionPage('p1', 'Test Page')],
      has_more: true,
      next_cursor: 'abc',
    }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    expect(shaped.serialized).toBeDefined()
    const parsed = JSON.parse(shaped.serialized!)
    expect(parsed).toEqual(shaped.shaped)
  })

  it('does not provide serialized string for passthrough results', () => {
    const shaped = shapeActionResponse('unknown-xyz', 'list-repos', { data: 1 })
    expect(shaped.compacted).toBe(false)
    expect(shaped.serialized).toBeUndefined()
  })

  it('reports resultCount for list responses', () => {
    const result = {
      object: 'list',
      results: [
        { object: 'user', id: 'u1', name: 'A', type: 'person' },
        { object: 'user', id: 'u2', name: 'B', type: 'person' },
        { object: 'user', id: 'u3', name: 'C', type: 'bot' },
      ],
      has_more: false,
      next_cursor: null,
    }

    const shaped = shapeActionResponse('notion', 'list-users', result)
    expect(shaped.resultCount).toBe(3)
  })

  it('reports resultCount=1 for single database response', () => {
    const result = {
      object: 'database',
      id: 'db-1',
      title: [{ plain_text: 'Test' }],
      properties: {},
    }

    const shaped = shapeActionResponse('notion', 'retrieve-database', result)
    expect(shaped.resultCount).toBe(1)
  })

  it('does not set resultCount for passthrough results', () => {
    const shaped = shapeActionResponse('unknown-xyz', 'list-channels', { channels: [] })
    expect(shaped.resultCount).toBeUndefined()
  })
})

/* ═══════════════════════════════════════════════════════════════
   Size reduction verification
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — size reduction', () => {
  it('realistic 10-page Notion search compacts by >50%', () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      makeNotionPage(`page-${i}`, `Document title number ${i} with extra words`),
    )
    const result = { object: 'list', results: pages, has_more: true, next_cursor: 'next-batch' }

    const shaped = shapeActionResponse('notion', 'search-pages', result)
    expect(shaped.compacted).toBe(true)
    const reductionPct = 1 - (shaped.shapedChars / shaped.originalChars)
    expect(reductionPct).toBeGreaterThan(0.5)
  })

  it('user list compaction achieves meaningful reduction', () => {
    const users = Array.from({ length: 10 }, (_, i) => ({
      object: 'user',
      id: `user-${i}`,
      name: `User Number ${i}`,
      type: i % 2 === 0 ? 'person' : 'bot',
      avatar_url: `https://cdn.example.com/avatars/user-${i}.jpg`,
      person: i % 2 === 0 ? { email: `user${i}@company.com` } : undefined,
      bot: i % 2 !== 0 ? { owner: { type: 'workspace' }, workspace_name: 'Team' } : undefined,
      request_id: `req-${crypto.randomUUID?.() ?? `id-${i}`}`,
    }))
    const result = { object: 'list', results: users, has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'list-users', result)
    expect(shaped.compacted).toBe(true)
    expect(shaped.shapedChars).toBeLessThan(shaped.originalChars)
  })

  it('block children compaction strips color and annotations', () => {
    const blocks = Array.from({ length: 8 }, (_, i) => ({
      object: 'block',
      id: `block-${i}`,
      type: 'paragraph',
      has_children: false,
      created_time: '2026-01-01T00:00:00.000Z',
      last_edited_time: '2026-03-01T00:00:00.000Z',
      created_by: { object: 'user', id: 'user-1' },
      last_edited_by: { object: 'user', id: 'user-2' },
      archived: false,
      in_trash: false,
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: `Paragraph ${i} with some content here.`, link: null },
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
            plain_text: `Paragraph ${i} with some content here.`,
            href: null,
          },
        ],
        color: 'default',
      },
    }))
    const result = { object: 'list', results: blocks, has_more: false, next_cursor: null }

    const shaped = shapeActionResponse('notion', 'retrieve-block-children', result)
    expect(shaped.compacted).toBe(true)
    expect(shaped.shapedChars).toBeLessThan(shaped.originalChars * 0.5)
  })
})

/* ═══════════════════════════════════════════════════════════════
   Edge cases
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — edge cases', () => {
  it('non-object result (string) returns passthrough', () => {
    const shaped = shapeActionResponse('notion', 'search-pages', 'string result')
    expect(shaped.compacted).toBe(false)
    expect(shaped.shaped).toBe('string result')
  })

  it('non-object result (number) returns passthrough', () => {
    const shaped = shapeActionResponse('notion', 'search-pages', 42)
    expect(shaped.compacted).toBe(false)
    expect(shaped.shaped).toBe(42)
  })

  it('non-object result (boolean) returns passthrough', () => {
    const shaped = shapeActionResponse('notion', 'list-users', true)
    expect(shaped.compacted).toBe(false)
    expect(shaped.shaped).toBe(true)
  })

  it('null result returns passthrough', () => {
    const shaped = shapeActionResponse('notion', 'search-pages', null)
    expect(shaped.compacted).toBe(false)
    expect(shaped.shaped).toBeNull()
  })

  it('undefined result returns passthrough', () => {
    const shaped = shapeActionResponse('notion', 'search-pages', undefined)
    expect(shaped.compacted).toBe(false)
    expect(shaped.shaped).toBeUndefined()
  })

  it('array result (not object) returns passthrough', () => {
    const arr = [1, 2, 3]
    // Arrays are typeof 'object' but shapeNotionResponse handles them as objects without results[]
    const shaped = shapeActionResponse('notion', 'search-pages', arr)
    expect(shaped.compacted).toBe(false)
    expect(shaped.shaped).toBe(arr)
  })

  it('object without results[] and not a database returns passthrough', () => {
    const result = { object: 'page', id: 'p1', url: 'https://notion.so/p1' }
    const shaped = shapeActionResponse('notion', 'search-pages', result)
    expect(shaped.compacted).toBe(false)
    expect(shaped.shaped).toBe(result)
  })

  it('fails open if shaper throws on malformed data', () => {
    // An object with a getter that throws — shaper should not crash the bridge
    const malformed = {
      get results() { throw new Error('boom') },
    }
    const shaped = shapeActionResponse('notion', 'search-pages', malformed)
    expect(shaped.compacted).toBe(false)
    expect(shaped.shaped).toBe(malformed)
  })

  it('fails open if shaper throws on property access error', () => {
    const malformed = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'results') throw new TypeError('cannot read')
        return undefined
      },
    })
    const shaped = shapeActionResponse('notion', 'search-pages', malformed)
    expect(shaped.compacted).toBe(false)
    expect(shaped.shaped).toBe(malformed)
  })

  it('handles retrieve-database action on non-database object (no id/object match)', () => {
    const result = { some_random: 'data', id: 'x' }
    const shaped = shapeActionResponse('notion', 'retrieve-database', result)
    // Not object=database and no results[] → passthrough
    expect(shaped.compacted).toBe(false)
  })

  it('handles page with rich_text segment missing plain_text', () => {
    const page = makeNotionPage('p1', '', {
      properties: {
        Title: {
          id: 'title',
          type: 'title',
          title: [
            { plain_text: 'Hello ' },
            { /* plain_text missing */ },
            { plain_text: 'World' },
          ],
        },
      },
    })
    const result = { object: 'list', results: [page], has_more: false, next_cursor: null }
    const shaped = shapeActionResponse('notion', 'search-pages', result)
    const compactedPage = (shaped.shaped as { results: Record<string, unknown>[] }).results[0]
    // Missing plain_text should be treated as empty string
    expect(compactedPage.title).toBe('Hello World')
  })

  it('handles empty provider string', () => {
    const shaped = shapeActionResponse('', 'search-pages', { data: 1 })
    expect(shaped.compacted).toBe(false)
    expect(shaped.shaped).toEqual({ data: 1 })
  })

  it('handles empty action name', () => {
    const result = {
      object: 'list',
      results: [{ id: '1' }],
      has_more: false,
      next_cursor: null,
    }
    const shaped = shapeActionResponse('notion', '', result)
    // Empty action name is unknown → passthrough for list with results[]
    expect(shaped.compacted).toBe(false)
  })
})

/* ═══════════════════════════════════════════════════════════════
   New page size entries
   ═══════════════════════════════════════════════════════════════ */

describe('applyDefaultPageSize — new providers', () => {
  it('injects default for twitter-v2:search-tweets → 10', () => {
    const result = applyDefaultPageSize('twitter-v2', 'search-tweets', {})
    expect(result.page_size).toBe(10)
  })

  it('injects default for google-calendar:list-events → 15', () => {
    const result = applyDefaultPageSize('google-calendar', 'list-events', {})
    expect(result.page_size).toBe(15)
  })

  it('injects default for google-calendar:list-upcoming-events → 15', () => {
    const result = applyDefaultPageSize('google-calendar', 'list-upcoming-events', {})
    expect(result.page_size).toBe(15)
  })

  it('injects default for google-calendar:list-calendar-list → 20', () => {
    const result = applyDefaultPageSize('google-calendar', 'list-calendar-list', {})
    expect(result.page_size).toBe(20)
  })

  it('injects default for google-sheets:list-spreadsheets → 15', () => {
    const result = applyDefaultPageSize('google-sheets', 'list-spreadsheets', {})
    expect(result.page_size).toBe(15)
  })

  it('injects default for asana:fetch-projects → 15', () => {
    const result = applyDefaultPageSize('asana', 'fetch-projects', {})
    expect(result.page_size).toBe(15)
  })

  it('injects default for linear:fetch-teams → 15', () => {
    const result = applyDefaultPageSize('linear', 'fetch-teams', {})
    expect(result.page_size).toBe(15)
  })

  it('injects default for gong:fetch-call-transcripts → 10', () => {
    const result = applyDefaultPageSize('gong', 'fetch-call-transcripts', {})
    expect(result.page_size).toBe(10)
  })
})

/* ═══════════════════════════════════════════════════════════════
   Pagination detection
   ═══════════════════════════════════════════════════════════════ */

describe('detectPagination', () => {
  it('detects HubSpot paging.next.after', () => {
    const result = detectPagination({ paging: { next: { after: 'abc123' } } })
    expect(result).toEqual({ has_more: true, next_cursor: 'abc123' })
  })

  it('detects Slack response_metadata.next_cursor', () => {
    const result = detectPagination({ response_metadata: { next_cursor: 'cursor-xyz' } })
    expect(result).toEqual({ has_more: true, next_cursor: 'cursor-xyz' })
  })

  it('ignores empty Slack next_cursor', () => {
    const result = detectPagination({ response_metadata: { next_cursor: '' } })
    expect(result).toEqual({ has_more: false, next_cursor: null })
  })

  it('detects Google nextPageToken', () => {
    const result = detectPagination({ nextPageToken: 'page2' })
    expect(result).toEqual({ has_more: true, next_cursor: 'page2' })
  })

  it('detects Twitter meta.next_token', () => {
    const result = detectPagination({ meta: { next_token: 'tok-123' } })
    expect(result).toEqual({ has_more: true, next_cursor: 'tok-123' })
  })

  it('detects Salesforce done=false + nextRecordsUrl', () => {
    const result = detectPagination({ done: false, nextRecordsUrl: '/services/data/v55.0/query/next' })
    expect(result).toEqual({ has_more: true, next_cursor: '/services/data/v55.0/query/next' })
  })

  it('detects Notion-style has_more + next_cursor', () => {
    const result = detectPagination({ has_more: true, next_cursor: 'notion-cursor' })
    expect(result).toEqual({ has_more: true, next_cursor: 'notion-cursor' })
  })

  it('returns false when no pagination found', () => {
    const result = detectPagination({ data: [1, 2, 3] })
    expect(result).toEqual({ has_more: false, next_cursor: null })
  })
})

/* ═══════════════════════════════════════════════════════════════
   Slack shaper
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — Slack', () => {
  it('compacts list-channels to id/name/topic/purpose/num_members/is_archived', () => {
    const result = {
      ok: true,
      channels: [
        { id: 'C1', name: 'general', topic: { value: 'General' }, purpose: { value: 'Main' }, num_members: 50, is_archived: false, created: 12345, creator: 'U1' },
        { id: 'C2', name: 'random', topic: { value: '' }, purpose: { value: '' }, num_members: 30, is_archived: true },
      ],
      response_metadata: { next_cursor: 'abc' },
    }
    const shaped = shapeActionResponse('slack', 'list-channels', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[]; has_more: boolean; next_cursor: string }
    expect(data.results).toHaveLength(2)
    expect(data.results[0]).toEqual({ id: 'C1', name: 'general', topic: 'General', purpose: 'Main', num_members: 50, is_archived: false })
    expect(data.has_more).toBe(true)
    expect(data.next_cursor).toBe('abc')
  })

  it('compacts list-users to id/name/real_name/display_name/email/is_admin/is_bot', () => {
    const result = {
      ok: true,
      members: [
        { id: 'U1', name: 'alice', real_name: 'Alice Smith', profile: { display_name: 'alice', email: 'alice@co.com', real_name: 'Alice Smith' }, is_admin: true, is_bot: false },
      ],
    }
    const shaped = shapeActionResponse('slack', 'list-users', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).toEqual({ id: 'U1', name: 'alice', real_name: 'Alice Smith', display_name: 'alice', email: 'alice@co.com', is_admin: true, is_bot: false })
  })

  it('compacts get-conversation-history messages', () => {
    const result = {
      ok: true,
      messages: [
        { ts: '1234.5', user: 'U1', text: 'Hello', thread_ts: '1234.0', reply_count: 3, reactions: [{ name: 'thumbsup' }], extra: 'data' },
      ],
    }
    const shaped = shapeActionResponse('slack', 'get-conversation-history', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).toMatchObject({ ts: '1234.5', user: 'U1', text: 'Hello', thread_ts: '1234.0', reply_count: 3 })
    expect(data.results[0]).not.toHaveProperty('extra')
  })

  it('passes through write actions unchanged', () => {
    const result = { ok: true, ts: '1234.5' }
    const shaped = shapeActionResponse('slack', 'send-message', result)
    expect(shaped.compacted).toBe(false)
  })
})

/* ═══════════════════════════════════════════════════════════════
   HubSpot shaper
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — HubSpot', () => {
  it('compacts list-contacts with property allowlist', () => {
    const result = {
      results: [
        { id: '101', properties: { firstname: 'Alice', lastname: 'Smith', email: 'a@co.com', company: 'Acme', phone: '555', lifecyclestage: 'lead', hs_object_id: '101' }, createdAt: '2026-01-01', updatedAt: '2026-03-01' },
      ],
      paging: { next: { after: '102' } },
    }
    const shaped = shapeActionResponse('hubspot', 'list-contacts', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[]; has_more: boolean; next_cursor: string }
    expect(data.results[0].properties).toEqual({ firstname: 'Alice', lastname: 'Smith', email: 'a@co.com', company: 'Acme', phone: '555' })
    expect(data.has_more).toBe(true)
    expect(data.next_cursor).toBe('102')
  })

  it('compacts list-deals with deal properties', () => {
    const result = {
      results: [
        { id: '201', properties: { dealname: 'Big Deal', amount: '50000', dealstage: 'closedwon', pipeline: 'default', hs_object_id: '201' }, createdAt: '2026-01-01', updatedAt: '2026-03-01' },
      ],
    }
    const shaped = shapeActionResponse('hubspot', 'list-deals', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0].properties).toEqual({ dealname: 'Big Deal', amount: '50000', dealstage: 'closedwon', pipeline: 'default' })
  })

  it('compacts get-contact single entity', () => {
    const result = { id: '101', properties: { firstname: 'Bob', lastname: 'Jones', email: 'b@co.com', company: 'X', phone: '111', extra: 'val' }, createdAt: '2026-01-01', updatedAt: '2026-03-01' }
    const shaped = shapeActionResponse('hubspot', 'get-contact', result)
    expect(shaped.compacted).toBe(true)
    expect(shaped.resultCount).toBe(1)
  })

  it('passes through unknown HubSpot actions', () => {
    const result = { data: 'something' }
    const shaped = shapeActionResponse('hubspot', 'create-contact', result)
    expect(shaped.compacted).toBe(false)
  })
})

/* ═══════════════════════════════════════════════════════════════
   Twitter shaper
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — Twitter', () => {
  it('compacts search-tweets data to essential fields', () => {
    const result = {
      data: [
        { id: 't1', text: 'Hello world', created_at: '2026-01-01', author_id: 'a1', public_metrics: { like_count: 10, retweet_count: 5, reply_count: 2 }, entities: { urls: [] } },
      ],
      meta: { next_token: 'tok-next', result_count: 1 },
    }
    const shaped = shapeActionResponse('twitter', 'search-tweets', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[]; has_more: boolean; next_cursor: string }
    expect(data.results[0]).toEqual({ id: 't1', text: 'Hello world', created_at: '2026-01-01', author_id: 'a1', like_count: 10, retweet_count: 5, reply_count: 2 })
    expect(data.has_more).toBe(true)
    expect(data.next_cursor).toBe('tok-next')
  })

  it('compacts get-followers to user fields', () => {
    const result = {
      data: [
        { id: 'u1', name: 'Alice', username: 'alice', verified: true, public_metrics: { followers_count: 1000, following_count: 200 } },
      ],
    }
    const shaped = shapeActionResponse('twitter', 'get-followers', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).toEqual({ id: 'u1', name: 'Alice', username: 'alice', verified: true, followers_count: 1000, following_count: 200 })
  })

  it('routes twitter-v2 through same shaper', () => {
    const result = { data: [{ id: 't1', text: 'Hi', public_metrics: {} }] }
    const shaped = shapeActionResponse('twitter-v2', 'search-tweets', result)
    expect(shaped.compacted).toBe(true)
  })

  it('passes through unknown twitter actions', () => {
    const result = { data: { id: 't1' } }
    const shaped = shapeActionResponse('twitter', 'post-tweet', result)
    expect(shaped.compacted).toBe(false)
  })
})

/* ═══════════════════════════════════════════════════════════════
   Google shaper (Calendar, Drive, Gmail, Sheets)
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — Google', () => {
  it('compacts calendar events from items[]', () => {
    const result = {
      items: [
        { id: 'evt1', summary: 'Standup', start: { dateTime: '2026-01-01T09:00:00Z' }, end: { dateTime: '2026-01-01T09:30:00Z' }, status: 'confirmed', htmlLink: 'https://cal.google.com/evt1', attendees: [{ email: 'a@co.com' }, { email: 'b@co.com' }], creator: { email: 'a@co.com' }, organizer: { email: 'a@co.com' } },
      ],
      nextPageToken: 'page2',
    }
    const shaped = shapeActionResponse('google', 'list-events', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[]; has_more: boolean; next_cursor: string }
    expect(data.results[0]).toEqual({ id: 'evt1', summary: 'Standup', start: '2026-01-01T09:00:00Z', end: '2026-01-01T09:30:00Z', status: 'confirmed', htmlLink: 'https://cal.google.com/evt1', attendees_count: 2 })
    expect(data.has_more).toBe(true)
    expect(data.next_cursor).toBe('page2')
  })

  it('compacts drive files', () => {
    const result = {
      files: [
        { id: 'f1', name: 'Report.docx', mimeType: 'application/vnd.google-apps.document', webViewLink: 'https://drive/f1', modifiedTime: '2026-03-01', size: '1234', owners: [{ displayName: 'Alice' }] },
      ],
    }
    const shaped = shapeActionResponse('google', 'list-files', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).toEqual({ id: 'f1', name: 'Report.docx', mimeType: 'application/vnd.google-apps.document', webViewLink: 'https://drive/f1', modifiedTime: '2026-03-01' })
  })

  it('compacts spreadsheet response', () => {
    const result = { spreadsheetId: 'ss1', properties: { title: 'Budget' }, sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] }
    const shaped = shapeActionResponse('google-sheets', 'get-spreadsheet', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as Record<string, unknown>
    expect(data).toMatchObject({ spreadsheetId: 'ss1', title: 'Budget', sheets: [{ sheetId: 0, title: 'Sheet1' }] })
  })

  it('routes google-calendar through same shaper', () => {
    const result = { items: [{ id: 'evt1', summary: 'Meet', start: { date: '2026-01-01' }, end: { date: '2026-01-02' } }] }
    const shaped = shapeActionResponse('google-calendar', 'list-events', result)
    expect(shaped.compacted).toBe(true)
  })
})

/* ═══════════════════════════════════════════════════════════════
   Salesforce shaper
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — Salesforce', () => {
  it('strips attributes metadata from records', () => {
    const result = {
      totalSize: 2,
      done: false,
      nextRecordsUrl: '/services/data/v55.0/query/next',
      records: [
        { attributes: { type: 'Contact', url: '/services/data/v55.0/sobjects/Contact/001' }, Id: '001', Name: 'Alice', Email: 'a@co.com' },
        { attributes: { type: 'Contact', url: '/services/data/v55.0/sobjects/Contact/002' }, Id: '002', Name: 'Bob', Email: 'b@co.com' },
      ],
    }
    const shaped = shapeActionResponse('salesforce', 'query-records', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[]; has_more: boolean; next_cursor: string }
    expect(data.results[0]).not.toHaveProperty('attributes')
    expect(data.results[0]).toMatchObject({ Id: '001', Name: 'Alice', Email: 'a@co.com' })
    expect(data.has_more).toBe(true)
    expect(data.next_cursor).toBe('/services/data/v55.0/query/next')
  })

  it('handles done=true (no more pages)', () => {
    const result = { totalSize: 1, done: true, records: [{ attributes: { type: 'Lead' }, Id: '003' }] }
    const shaped = shapeActionResponse('salesforce', 'query-records', result)
    const data = shaped.shaped as { has_more: boolean }
    expect(data.has_more).toBe(false)
  })
})

/* ═══════════════════════════════════════════════════════════════
   Zendesk shaper
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — Zendesk', () => {
  it('compacts search-tickets to essential fields', () => {
    const result = {
      results: [
        { id: 1001, subject: 'Login issue', status: 'open', priority: 'high', created_at: '2026-01-01', updated_at: '2026-03-01', assignee_id: 42, description: 'Long description...', tags: ['urgent'], via: { channel: 'email' } },
      ],
    }
    const shaped = shapeActionResponse('zendesk', 'search-tickets', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).toEqual({ id: 1001, subject: 'Login issue', status: 'open', priority: 'high', created_at: '2026-01-01', updated_at: '2026-03-01', assignee_id: 42 })
  })

  it('compacts fetch-articles to essential fields', () => {
    const result = {
      articles: [
        { id: 2001, title: 'Getting Started', section_id: 3001, html_url: 'https://help.example.com/articles/2001', created_at: '2026-01-01', body: '<p>Long HTML body...</p>', author_id: 99 },
      ],
    }
    const shaped = shapeActionResponse('zendesk', 'fetch-articles', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).toEqual({ id: 2001, title: 'Getting Started', section_id: 3001, html_url: 'https://help.example.com/articles/2001', created_at: '2026-01-01' })
  })
})

/* ═══════════════════════════════════════════════════════════════
   GitHub shaper
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — GitHub', () => {
  it('compacts list-repos array response', () => {
    const result = [
      { id: 1, name: 'my-repo', full_name: 'user/my-repo', description: 'A repo', html_url: 'https://github.com/user/my-repo', language: 'TypeScript', stargazers_count: 42, forks_count: 5, open_issues_count: 3, topics: ['web'], visibility: 'public' },
    ]
    const shaped = shapeActionResponse('github', 'list-repos', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).toEqual({ id: 1, name: 'my-repo', full_name: 'user/my-repo', description: 'A repo', html_url: 'https://github.com/user/my-repo', language: 'TypeScript', stargazers_count: 42 })
  })

  it('compacts list-issues with labels', () => {
    const result = [
      { number: 42, title: 'Bug: crash', state: 'open', html_url: 'https://github.com/user/repo/issues/42', user: { login: 'alice' }, labels: [{ name: 'bug' }, { name: 'priority' }], created_at: '2026-01-01', body: 'Long description...' },
    ]
    const shaped = shapeActionResponse('github', 'list-issues', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).toMatchObject({ number: 42, title: 'Bug: crash', state: 'open', user_login: 'alice', labels: ['bug', 'priority'] })
  })

  it('compacts list-pull-requests with head/base refs', () => {
    const result = [
      { number: 99, title: 'feat: add feature', state: 'open', html_url: 'https://github.com/user/repo/pull/99', user: { login: 'bob' }, head: { ref: 'feat-branch' }, base: { ref: 'main' }, body: 'Long body...' },
    ]
    const shaped = shapeActionResponse('github', 'list-pull-requests', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).toMatchObject({ number: 99, title: 'feat: add feature', user_login: 'bob', head_ref: 'feat-branch', base_ref: 'main' })
  })

  it('compacts single repo object', () => {
    const result = { id: 1, name: 'my-repo', full_name: 'user/my-repo', description: 'A repo', html_url: 'url', language: 'Go', stargazers_count: 10, forks_count: 2 }
    const shaped = shapeActionResponse('github', 'get-repo', result)
    expect(shaped.compacted).toBe(true)
    expect(shaped.resultCount).toBe(1)
  })
})

/* ═══════════════════════════════════════════════════════════════
   Generic shaper (11 small providers)
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — generic shaper', () => {
  it('compacts asana response with results array', () => {
    const result = { data: [{ gid: '1', name: 'Project A', notes: 'desc', workspace: { gid: 'w1' } }] }
    const shaped = shapeActionResponse('asana', 'fetch-projects', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).toMatchObject({ gid: '1', name: 'Project A' })
  })

  it('strips _links and metadata keys', () => {
    const result = { items: [{ id: '1', name: 'Item', _links: { self: '/api/1' }, metadata: { extra: true }, request_id: 'req-1' }] }
    const shaped = shapeActionResponse('linear', 'fetch-teams', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: Record<string, unknown>[] }
    expect(data.results[0]).not.toHaveProperty('_links')
    expect(data.results[0]).not.toHaveProperty('metadata')
    expect(data.results[0]).not.toHaveProperty('request_id')
  })

  it('limits arrays to 25 items', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: `item-${i}`, name: `Item ${i}` }))
    const result = { records: items }
    const shaped = shapeActionResponse('airtable', 'list-records', result)
    expect(shaped.compacted).toBe(true)
    const data = shaped.shaped as { results: unknown[]; _total: number }
    expect(data.results).toHaveLength(25)
    expect(data._total).toBe(50)
  })

  it('compacts single object responses', () => {
    const result = { id: '1', name: 'Meeting', duration: 30, participants: ['a@co.com'] }
    const shaped = shapeActionResponse('calendly', 'get-event', result)
    expect(shaped.compacted).toBe(true)
  })

  it('handles non-object result as passthrough', () => {
    const shaped = shapeActionResponse('jira', 'create-issue', 'success')
    expect(shaped.compacted).toBe(false)
  })

  it('all 11 generic providers are routed', () => {
    const providers = ['asana', 'linear', 'intercom', 'airtable', 'calendly', 'aircall', 'jira', 'gong', 'fireflies', 'linkedin', 'aws-iam']
    for (const p of providers) {
      const result = { data: [{ id: '1' }] }
      const shaped = shapeActionResponse(p, 'list-items', result)
      expect(shaped.compacted).toBe(true)
    }
  })
})

/* ═══════════════════════════════════════════════════════════════
   Contract shape conformance
   ═══════════════════════════════════════════════════════════════ */

describe('shapeActionResponse — contract conformance', () => {
  it('all list shapers include has_more and next_cursor', () => {
    const testCases = [
      { provider: 'slack', action: 'list-channels', result: { channels: [{ id: 'C1', name: 'g' }] } },
      { provider: 'hubspot', action: 'list-contacts', result: { results: [{ id: '1', properties: {} }] } },
      { provider: 'twitter', action: 'search-tweets', result: { data: [{ id: 't1', text: 'hi' }] } },
      { provider: 'google', action: 'list-events', result: { items: [{ id: 'e1', summary: 'm' }] } },
      { provider: 'salesforce', action: 'query-records', result: { records: [{ Id: '1' }], done: true } },
      { provider: 'zendesk', action: 'search-tickets', result: { results: [{ id: 1, subject: 'x' }] } },
      { provider: 'github', action: 'list-repos', result: [{ id: 1, name: 'r' }] },
      { provider: 'asana', action: 'list-items', result: { data: [{ id: '1' }] } },
    ]

    for (const { provider, action, result } of testCases) {
      const shaped = shapeActionResponse(provider, action, result)
      if (shaped.compacted) {
        const data = shaped.shaped as Record<string, unknown>
        expect(data).toHaveProperty('has_more')
        expect(data).toHaveProperty('next_cursor')
      }
    }
  })

  it('all compacted results have _compact: true', () => {
    const testCases = [
      { provider: 'slack', action: 'list-channels', result: { channels: [{ id: 'C1', name: 'g' }] } },
      { provider: 'hubspot', action: 'list-contacts', result: { results: [{ id: '1', properties: {} }] } },
      { provider: 'github', action: 'list-repos', result: [{ id: 1, name: 'r' }] },
    ]

    for (const { provider, action, result } of testCases) {
      const shaped = shapeActionResponse(provider, action, result)
      if (shaped.compacted) {
        const data = shaped.shaped as Record<string, unknown>
        expect(data._compact).toBe(true)
      }
    }
  })
})
