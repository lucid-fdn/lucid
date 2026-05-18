import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { verifyExternalKnowledgeToken } from '@/lib/db'
import {
  getKnowledgeAuthScopesForOperation,
  hasKnowledgeAuthScopes,
  normalizeKnowledgeOperationId,
} from '@/lib/knowledge/auth-scopes'
import { runExternalKnowledgeOperation } from '@/lib/knowledge/external-operation-runner'
import {
  getKnowledgeOperation,
  toMcpToolDefinitions,
  type KnowledgeOperationId,
} from '@/lib/knowledge/operations'
import type { KnowledgeAuthScope } from '@contracts/knowledge-auth'

export const dynamic = 'force-dynamic'

const mcpJsonRpcSchema = z.object({
  jsonrpc: z.literal('2.0').optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
  if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const client = await clientFromRequest(req)
  if (!client) return NextResponse.json({ error: 'Invalid external Knowledge token' }, { status: 401 })

  return NextResponse.json({
    schemaVersion: '2026-05-07.lucid-knowledge-mcp.v1',
    tools: allowedMcpTools(client.scopes),
  })
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
  if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const token = parseBearerToken(req.headers.get('authorization'))
  if (!token) return jsonRpc(null, null, { code: -32001, message: 'Missing bearer token' }, 401)

  const parsed = mcpJsonRpcSchema.safeParse(await req.json())
  if (!parsed.success) {
    return jsonRpc(null, null, { code: -32600, message: 'Invalid request', data: parsed.error.issues }, 400)
  }

  if (parsed.data.method === 'tools/list') {
    const client = await verifyExternalKnowledgeToken({ token, touch: false })
    if (!client) return jsonRpc(parsed.data.id ?? null, null, { code: -32001, message: 'Invalid external Knowledge token' }, 401)
    return jsonRpc(parsed.data.id ?? null, { tools: allowedMcpTools(client.scopes) })
  }

  if (parsed.data.method !== 'tools/call') {
    return jsonRpc(parsed.data.id ?? null, null, { code: -32601, message: 'Method not found' }, 404)
  }

  const call = parseToolCallParams(parsed.data.params)
  if (!call.ok) return jsonRpc(parsed.data.id ?? null, null, { code: -32602, message: call.error }, 400)

  const operationId = operationIdForMcpTool(call.name)
  if (!operationId) return jsonRpc(parsed.data.id ?? null, null, { code: -32602, message: 'Unknown Lucid Knowledge tool' }, 400)

  const result = await runExternalKnowledgeOperation({
    token,
    operation: operationId,
    input: call.arguments,
    surface: 'mcp',
    requestId: typeof parsed.data.id === 'string' ? parsed.data.id : undefined,
  })

  if (!result.envelope.ok) {
    return jsonRpc(parsed.data.id ?? null, null, {
      code: result.status === 403 ? -32003 : result.status === 401 ? -32001 : -32000,
      message: result.envelope.error?.message ?? 'Lucid Knowledge tool failed',
      data: result.envelope.error?.details,
    }, result.status)
  }

  return jsonRpc(parsed.data.id ?? null, {
    content: [{
      type: 'text',
      text: JSON.stringify(result.envelope.result),
    }],
    structuredContent: result.envelope.result,
  })
}

function allowedMcpTools(scopes: KnowledgeAuthScope[]) {
  return toMcpToolDefinitions()
    .filter((tool) => {
      const operationId = normalizeKnowledgeOperationId(tool.operationId)
      if (!operationId) return false
      return hasKnowledgeAuthScopes(scopes, getKnowledgeAuthScopesForOperation(operationId))
    })
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        additionalProperties: true,
      },
      annotations: {
        operationId: tool.operationId,
        mutation: tool.mutation,
        latencyClass: tool.latencyClass,
      },
    }))
}

function operationIdForMcpTool(name: string): KnowledgeOperationId | null {
  const tool = toMcpToolDefinitions().find((candidate) => candidate.name === name)
  if (!tool) return null
  const operation = getKnowledgeOperation(tool.operationId)
  return operation?.id ?? null
}

async function clientFromRequest(req: NextRequest) {
  const token = parseBearerToken(req.headers.get('authorization'))
  if (!token) return null
  return verifyExternalKnowledgeToken({ token, touch: false })
}

function parseBearerToken(value: string | null): string | null {
  if (!value) return null
  const match = /^Bearer\s+(.+)$/i.exec(value.trim())
  return match?.[1] ?? null
}

function parseToolCallParams(params: Record<string, unknown> | undefined): (
  | { ok: true; name: string; arguments: Record<string, unknown> }
  | { ok: false; error: string }
) {
  const name = params?.name
  if (typeof name !== 'string' || !name.trim()) return { ok: false, error: 'Tool name is required' }
  const args = params?.arguments
  return {
    ok: true,
    name,
    arguments: args && typeof args === 'object' && !Array.isArray(args)
      ? args as Record<string, unknown>
      : {},
  }
}

function jsonRpc(
  id: string | number | null,
  result: unknown,
  error?: { code: number; message: string; data?: unknown } | null,
  status = 200,
) {
  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    ...(error ? { error } : { result }),
  }, { status })
}
