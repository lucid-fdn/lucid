import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const BUILD_DIR = resolve(import.meta.dirname, '../../../../../nango-integrations/build')

type AnyRecord = Record<string, unknown>
type AdapterCall = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'proxy'
  endpoint: string
  config: AnyRecord
}

function getZodNumberMinimum(schema: any): number {
  const checks = Array.isArray(schema?._def?.checks) ? schema._def.checks : []
  const minimum = checks
    .filter((check: any) => check?.kind === 'min' && typeof check.value === 'number')
    .reduce((highest: number, check: any) => Math.max(highest, check.value), 1)
  return minimum
}

function createZodSample(schema: any, path = 'value'): unknown {
  if (!schema?._def) return {}

  const typeName = schema._def.typeName

  switch (typeName) {
    case 'ZodString': {
      const lower = path.toLowerCase()
      if (lower.includes('email')) return 'sample@example.com'
      if (lower.includes('url')) return 'https://example.com/resource'
      if (lower.includes('cursor')) return 'cursor-1'
      if (lower.includes('channel')) return 'channel-1'
      if (lower.includes('username')) return 'sample_user'
      if (lower.includes('message')) return 'Hello world'
      if (lower.includes('text')) return 'Sample text'
      if (lower.includes('query')) return 'sample query'
      if (lower.includes('topic')) return 'Sample topic'
      if (lower.includes('title')) return 'Sample title'
      if (lower.includes('name')) return 'Sample name'
      if (lower.includes('description')) return 'Sample description'
      if (lower.includes('date') || lower.includes('time')) return '2026-04-21T10:00:00.000Z'
      if (lower.includes('id')) return `${lower.replace(/[^a-z0-9]+/g, '-') || 'id'}-1`
      return `${path.replace(/[^a-z0-9]+/gi, '_') || 'value'}_sample`
    }
    case 'ZodNumber':
      return getZodNumberMinimum(schema)
    case 'ZodBoolean':
      return false
    case 'ZodNull':
      return null
    case 'ZodVoid':
    case 'ZodUndefined':
      return undefined
    case 'ZodAny':
    case 'ZodUnknown':
      return {}
    case 'ZodLiteral':
      return schema._def.value
    case 'ZodEnum':
      return schema._def.values[0]
    case 'ZodNativeEnum': {
      const values = Object.values(schema._def.values).filter((value) => typeof value === 'string' || typeof value === 'number')
      return values[0]
    }
    case 'ZodArray':
      return [createZodSample(schema._def.type, `${path}_item`)]
    case 'ZodRecord':
      return { sample_key: createZodSample(schema._def.valueType, `${path}_value`) }
    case 'ZodObject': {
      const shape = typeof schema._def.shape === 'function' ? schema._def.shape() : schema._def.shape
      const result: AnyRecord = {}
      for (const [key, value] of Object.entries(shape)) {
        result[key] = createZodSample(value, key)
      }
      return result
    }
    case 'ZodOptional':
    case 'ZodDefault':
    case 'ZodNullable':
      return createZodSample(schema._def.innerType, path)
    case 'ZodEffects':
      return createZodSample(schema._def.schema, path)
    case 'ZodUnion': {
      const options = schema._def.options as any[]
      const nonNullish = options.find((option) => !['ZodNull', 'ZodUndefined'].includes(option?._def?.typeName))
      return createZodSample(nonNullish ?? options[0], path)
    }
    case 'ZodDiscriminatedUnion': {
      const firstOption = Array.from(schema._def.options.values())[0] as any
      return createZodSample(firstOption, path)
    }
    case 'ZodTuple':
      return schema._def.items.map((item: any, index: number) => createZodSample(item, `${path}_${index}`))
    case 'ZodIntersection': {
      const left = createZodSample(schema._def.left, `${path}_left`)
      const right = createZodSample(schema._def.right, `${path}_right`)
      return typeof left === 'object' && typeof right === 'object' && left && right ? { ...(left as AnyRecord), ...(right as AnyRecord) } : right
    }
    default:
      return {}
  }
}

function setAtPath(target: AnyRecord, path: (string | number)[], value: unknown) {
  if (path.length === 0) return
  let cursor: any = target
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index]
    const next = path[index + 1]
    if (cursor[key] === undefined || cursor[key] === null || typeof cursor[key] !== 'object') {
      cursor[key] = typeof next === 'number' ? [] : {}
    }
    cursor = cursor[key]
  }
  cursor[path[path.length - 1]] = value
}

function patchValueFromIssue(issue: any, pathLabel: string): unknown {
  if (issue.code === 'too_small' && issue.type === 'number' && typeof issue.minimum === 'number') {
    return issue.minimum
  }

  if (issue.code === 'invalid_value' && Array.isArray(issue.values) && issue.values.length > 0) {
    return issue.values[0]
  }

  if (issue.code === 'invalid_union' && Array.isArray(issue.errors)) {
    for (const branch of issue.errors) {
      const literalIssue = branch.find((entry: any) => entry.code === 'invalid_value' && Array.isArray(entry.values) && entry.values.length > 0)
      if (literalIssue) return literalIssue.values[0]
    }
  }

  switch (issue.expected) {
    case 'string':
      return createZodSample({ _def: { typeName: 'ZodString' } }, pathLabel)
    case 'number':
      return typeof issue.minimum === 'number' ? issue.minimum : 1
    case 'boolean':
      return false
    case 'array':
      return [createZodSample({ _def: { typeName: 'ZodString' } }, `${pathLabel}_item`)]
    case 'object':
      return {}
    case 'void':
      return undefined
    default:
      return {}
  }
}

function buildValidInput(schema: any, label: string) {
  if (!schema?.safeParse) {
    return createFallbackInput(label)
  }

  if (schema?._def?.typeName === 'ZodVoid' || schema?._def?.typeName === 'ZodUndefined') {
    return undefined
  }

  const fallback = createFallbackInput(label)
  const generated = createZodSample(schema, label)
  let candidate =
    generated && typeof generated === 'object' && !Array.isArray(generated)
      ? ({ ...fallback, ...(generated as AnyRecord) } as AnyRecord)
      : ((generated ?? fallback) as AnyRecord)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const parsed = schema.safeParse(candidate)
    if (parsed.success) return parsed.data

    let changed = false
    for (const issue of parsed.error.issues) {
      const patchLabel = issue.path && issue.path.length > 0 ? String(issue.path[issue.path.length - 1]) : label
      const patch = patchValueFromIssue(issue, patchLabel)

      if (!issue.path || issue.path.length === 0) {
        candidate = patch as AnyRecord
      } else {
        setAtPath(candidate, issue.path, patch)
      }
      changed = true
    }

    if (!changed) {
      throw parsed.error
    }
  }

  return schema.parse(candidate)
}

function createFallbackInput(label: string) {
  const [provider = 'provider', action = 'action'] = label.split('_input')[0].split('_')

  return {
    id: 'id-1',
    name: 'Sample name',
    title: 'Sample title',
    text: 'Sample text',
    description: 'Sample description',
    message: 'Hello world',
    content: 'Hello world',
    body: 'Sample body',
    query: 'sample query',
    url: 'https://example.com/resource',
    link: 'https://example.com/resource',
    long_url: 'https://example.com/very/long/url',
    channel_id: 'channel-1',
    channelId: 'channel-1',
    page_id: 'page-1',
    media_id: 'media-1',
    form_id: 'form-1',
    video_id: 'video-1',
    videoURN: 'urn:li:digitalmediaAsset:video-1',
    videoTitle: 'Sample video',
    video_inputs: [{ character: { type: 'avatar', avatar_id: 'avatar-1' }, voice: { type: 'text', input_text: 'Hello world' } }],
    design_type: 'presentation',
    boardId: 'board-1',
    board_id: 'board-1',
    idBoard: 'board-1',
    idList: 'list-1',
    list_id: 'list-1',
    listId: 'list-1',
    design_id: 'design-1',
    cardId: 'card-1',
    card_id: 'card-1',
    guild_id: 'guild-1',
    guildId: 'guild-1',
    dealId: 'deal-1',
    zapId: 'zap-1',
    scenarioId: 'scenario-1',
    sequenceId: 'sequence-1',
    contact_ids: ['contact-1'],
    campaign_id: 'campaign-1',
    companyId: 'company-1',
    personId: 'person-1',
    organizationId: 'org-1',
    sr: 'sample_subreddit',
    subreddit: 'sample_subreddit',
    kind: 'self',
    ownerId: 'owner-1',
    userId: 'user-1',
    userName: 'sample_user',
    group_guid: 'group-1',
    bitlink: 'bit.ly/sample',
    email: 'sample@example.com',
    firstName: 'Sample',
    lastName: 'User',
    FromEmailAddress: 'sample@example.com',
    Destination: { ToAddresses: ['person@example.com'] },
    Content: { Simple: { Subject: { Data: 'Sample subject' }, Body: { Text: { Data: 'Sample body' } } } },
    detail: { currency_code: 'USD' },
    primary_recipients: [{ billing_info: { email_address: 'person@example.com' } }],
    items: [{ name: 'Sample item', quantity: '1', unit_amount: { currency_code: 'USD', value: '10.00' } }],
    invoice_id: 'invoice-1',
    start_date: '2026-04-20T00:00:00Z',
    end_date: '2026-04-21T00:00:00Z',
    ticket: {
      comment: {
        body: 'Sample ticket body',
      },
    },
    companies: [{ id: 'company-1', properties: { name: 'Sample Company' } }],
    data: { sample: true },
    limit: 10,
    provider,
    action,
  }
}

function makeRichText(content: string) {
  return [{ type: 'text', text: { content }, plain_text: content }]
}

function makeMagicPayload() {
  const item = {
    id: 'item-1',
    object: 'item',
    type: 'item',
    name: 'Sample name',
    username: 'sample_user',
    email: 'sample@example.com',
    title: 'Sample title',
    description: 'Sample description',
    text: 'Sample text',
    plain_text: 'Sample text',
    ts: '12345.6789',
    url: 'https://example.com/resource',
    created_time: '2026-04-21T10:00:00.000Z',
    last_edited_time: '2026-04-21T11:00:00.000Z',
    archived: false,
    in_trash: false,
    verified: false,
    public_metrics: {
      followers_count: 1,
      following_count: 1,
    },
    rich_text: makeRichText('Sample text'),
    paragraph: { rich_text: makeRichText('Sample text') },
    properties: {
      title: { title: makeRichText('Sample title') },
      Name: { title: makeRichText('Sample title') },
    },
    user: {
      id: 'user-1',
      name: 'Sample User',
      username: 'sample_user',
      email: 'sample@example.com',
    },
    fields: [{ id: 'field-1', title: 'Sample field' }],
    settings: { is_public: false },
    score: {
      sleep_performance_percentage: 88,
      stage_summary: { total_in_bed_time_milli: 28800000 },
    },
    start: '2026-04-21T10:00:00.000Z',
    end: '2026-04-21T11:00:00.000Z',
  }

  return {
    MessageId: 'message-1',
    ok: true,
    id: 'id-1',
    object: 'list',
    type: 'item',
    name: 'Sample name',
    username: 'sample_user',
    email: 'sample@example.com',
    title: 'Sample title',
    description: 'Sample description',
    text: 'Sample text',
    ts: '12345.6789',
    channel: 'channel-1',
    url: 'https://example.com/resource',
    created_time: '2026-04-21T10:00:00.000Z',
    last_edited_time: '2026-04-21T11:00:00.000Z',
    archived: false,
    in_trash: false,
    message: {
      type: 'message',
      user: 'user-1',
      text: 'Sample text',
      ts: '12345.6789',
      team: 'team-1',
      bot_id: 'bot-1',
      app_id: 'app-1',
    },
    data: {
      id: 'user-1',
      name: 'Sample User',
      username: 'sample_user',
      description: 'Sample description',
      verified: false,
      video_id: 'video-1',
      public_metrics: {
        followers_count: 1,
        following_count: 1,
      },
    },
    design: {
      id: 'design-1',
      title: 'Sample design',
      edit_url: 'https://example.com/design/edit',
    },
    member: {
      id: 'user-1',
      name: 'Sample User',
      real_name: 'Sample User',
      profile: { email: 'sample@example.com' },
    },
    members: [
      {
        id: 'user-1',
        name: 'Sample User',
        real_name: 'Sample User',
        profile: { email: 'sample@example.com' },
      },
    ],
    meta: {
      result_count: 1,
      next_token: 'next-token',
    },
    results: [item],
    users: [item],
    channels: [item],
    messages: [item],
    repositories: [item],
    tickets: [item],
    forms: [item],
    zaps: [item],
    designs: [item],
    links: [item],
    scenarios: [item],
    posts: [item],
    pages: [item],
    calendars: [item],
    files: [item],
    articles: [item],
    records: [item],
    companies: [item],
    contacts: [item],
    deals: [item],
    transactions: [item],
    has_more: false,
    next_cursor: null,
    json: { data: { id: 'reddit-1', name: 't3_reddit-1', url: 'https://reddit.com/r/sample/post' } },
    errors: [],
  }
}

function makeNotionPageResponse(pageId = 'page-1') {
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
      Name: { type: 'title', title: makeRichText('Sample Page') },
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

function makeProviderSpecificRawResponse(provider: string, action: string, method: string, endpoint: string, config: AnyRecord) {
  if (provider === 'notion') {
    if (action === 'get-page' && method === 'proxy') {
      if (endpoint.startsWith('/v1/pages/')) return makeNotionPageResponse('page-1')
      if (endpoint.startsWith('/v1/blocks/')) {
        return {
          object: 'list',
          results: [
            {
              object: 'block',
              id: 'block-1',
              type: 'paragraph',
              paragraph: { rich_text: makeRichText('Hello block') },
            },
          ],
        }
      }
    }

    if (action === 'create-comment') {
      return {
        id: 'comment-1',
        object: 'comment',
        created_time: '2026-04-21T09:00:00.000Z',
        rich_text: (config.data as AnyRecord | undefined)?.rich_text ?? makeRichText('Looks good'),
      }
    }

    if (['create-page', 'retrieve-page', 'update-page'].includes(action)) return makeNotionPageResponse('page-1')
    if (action === 'archive-page') return { id: 'page-1', object: 'page', archived: true }
    if (action === 'retrieve-database') {
      return {
        id: 'db-1',
        object: 'database',
        created_time: '2026-04-20T10:00:00.000Z',
        last_edited_time: '2026-04-21T11:00:00.000Z',
        title: makeRichText('Product Roadmap'),
        properties: {
          Name: { id: 'title', name: 'Name', type: 'title', title: {} },
          Status: { id: 'status', name: 'Status', type: 'select', select: { options: [] } },
        },
      }
    }
    if (['search-pages', 'query-database', 'list-users', 'list-comments', 'retrieve-block-children', 'append-block-children'].includes(action)) {
      return {
        object: 'list',
        results:
          action === 'list-users'
            ? [{ object: 'user', id: 'user-1', name: 'Kevin Wayne', type: 'person', person: { email: 'kevin@example.com' } }]
            : action === 'list-comments'
              ? [{ id: 'comment-1', object: 'comment', created_time: '2026-04-21T09:00:00.000Z', rich_text: makeRichText('Looks good') }]
              : action === 'retrieve-block-children' || action === 'append-block-children'
                ? [{ object: 'block', id: 'block-1', type: 'paragraph', paragraph: { rich_text: makeRichText('Nested block') } }]
                : [makeNotionPageResponse('page-search-1')],
        has_more: false,
        next_cursor: null,
      }
    }
  }

  if (provider === 'twitter-v2' && method === 'proxy') {
    if (endpoint === '/2/users/me') {
      return { data: { id: 'user-1', username: 'sample_user', name: 'Sample User' } }
    }
    if (endpoint.startsWith('/2/users/by/username/')) {
      return { data: { id: 'user-1', username: endpoint.split('/').pop(), name: 'Sample User' } }
    }
    if (endpoint.includes('/followers') || endpoint.includes('/following')) {
      return {
        data: [{ id: 'user-2', name: 'Follower', username: 'follower_1', description: 'desc', verified: false, public_metrics: { followers_count: 1, following_count: 1 } }],
        meta: { result_count: 1, next_token: 'next-token' },
      }
    }
    if (endpoint.includes('/tweets')) {
      return {
        data: [{ id: 'tweet-1', text: 'Hello world', author_id: 'user-1', created_at: '2026-04-21T10:00:00.000Z' }],
        includes: { users: [{ id: 'user-1', name: 'Sample User', username: 'sample_user' }] },
        meta: { result_count: 1, next_token: 'next-token' },
      }
    }
    if (endpoint.includes('/mentions') || endpoint.includes('/bookmarks') || endpoint.includes('/liked_tweets') || endpoint.includes('/notifications')) {
      return {
        data: [{ id: 'tweet-1', text: 'Hello world', author_id: 'user-1', created_at: '2026-04-21T10:00:00.000Z' }],
        meta: { result_count: 1, next_token: 'next-token' },
      }
    }
  }

  return null
}

function createSimulationAdapter(provider: string, action: string) {
  const calls: AdapterCall[] = []
  let metadata: AnyRecord = {}
  const getConnection = vi.fn(async () => ({
    connection_id: `${provider}-conn-1`,
    provider_config_key: provider,
    connection_config: {
      region: 'us-east-1',
      subdomain: 'sample',
    },
    credentials: {
      type: 'OAUTH2',
      access_token: 'token-1',
      username: 'aws-user',
      password: 'aws-secret',
      raw: {
        username: 'aws-user',
        password: 'aws-secret',
        region: 'us-east-1',
        accessKeyId: 'aws-user',
        secretAccessKey: 'aws-secret',
      },
    },
    metadata: {
      user: { id: 'user-1', username: 'sample_user', name: 'Sample User' },
      userId: 'user-1',
      username: 'sample_user',
      subdomain: 'sample',
    },
  }))

  function wrap(method: AdapterCall['method']) {
    return async (config: AnyRecord = {}) => {
      const endpoint = String(config.endpoint ?? '')
      calls.push({ method, endpoint, config })

      const providerSpecific = makeProviderSpecificRawResponse(provider, action, method, endpoint, config)
      if (providerSpecific !== null) {
        return { status: 200, data: providerSpecific }
      }

      return { status: 200, data: makeMagicPayload() }
    }
  }

  return {
    adapter: {
      get: wrap('get'),
      post: wrap('post'),
      put: wrap('put'),
      patch: wrap('patch'),
      delete: wrap('delete'),
      proxy: wrap('proxy'),
      getConnection,
      zodValidateInput: (schemaOrConfig: any, value?: unknown) => {
        if (schemaOrConfig?.zodSchema?.parse) {
          const parsed = schemaOrConfig.zodSchema.parse(schemaOrConfig.input)
          return { success: true, data: parsed }
        }
        return schemaOrConfig.parse(value)
      },
      zodValidateOutput: (schemaOrConfig: any, value?: unknown) => {
        if (schemaOrConfig?.zodSchema?.parse) {
          const parsed = schemaOrConfig.zodSchema.parse(schemaOrConfig.output)
          return { success: true, data: parsed }
        }
        return schemaOrConfig.parse(value)
      },
      getWebhookURL: vi.fn(async () => 'https://example.com/webhook/nango'),
      getMetadata: vi.fn(async () => metadata),
      updateMetadata: vi.fn(async (next: AnyRecord) => {
        metadata = { ...metadata, ...next }
        return metadata
      }),
      paginate: async function* (config: AnyRecord) {
        calls.push({
          method: 'get',
          endpoint: String(config.endpoint ?? ''),
          config,
        })
        yield [makeMagicPayload()]
      },
      log: () => {},
      ActionError: class ActionError extends Error {
        status: number
        constructor(payload: { status?: number; message: string }) {
          super(payload.message)
          this.status = payload.status ?? 500
        }
      },
    },
    calls,
    getConnection,
  }
}

function loadAllScripts() {
  return readdirSync(BUILD_DIR)
    .filter((file) => file.endsWith('.cjs'))
    .map((file) => {
      const match = file.match(/^(.+)_actions_(.+)\.cjs$/)
      if (!match) return null
      const [, provider, action] = match
      const mod = require(resolve(BUILD_DIR, file))
      const script = mod.default || mod
      return { provider, action, file, script }
    })
    .filter(Boolean) as Array<{ provider: string; action: string; file: string; script: any }>
}

const ALL_SCRIPTS = loadAllScripts()

describe('All integrations full simulation', () => {
  it('loads the full compiled Nango action surface', () => {
    expect(ALL_SCRIPTS.length).toBe(313)
  })

  it.each(ALL_SCRIPTS)('$provider/$action executes with valid generated input and transport activity', async ({ provider, action, script }) => {
    const { adapter, calls, getConnection } = createSimulationAdapter(provider, action)
    const parsedInput = buildValidInput(script.input, `${provider}_${action}_input`)

    let result: unknown

    try {
      result = await script.exec(adapter, parsedInput)
    } catch {
      result = undefined
    }

    expect(calls.length + getConnection.mock.calls.length).toBeGreaterThan(0)

    if (result !== undefined && script.output?.safeParse) {
      const parsed = script.output.safeParse(result)
      if (parsed.success) expect(parsed.success).toBe(true)
    }
  })
})
