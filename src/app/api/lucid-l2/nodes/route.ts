/**
 * Lucid-L2 Node Types API Route
 * 
 * Thin API layer that calls the node service.
 * All business logic is in src/lib/lucid-l2/node-service.ts
 */

import { NextResponse } from 'next/server'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/lucid-l2/nodes
 * 
 * Industry standard implementation:
 * - WITH search: Query Elasticsearch directly (fast, all results)
 * - WITHOUT search: Use cached nodes (browsing mode)
 * 
 * Query params: cursor, limit, category, q (search)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const limit = parseInt(searchParams.get('limit') || '50')
  const categoryRaw = searchParams.get('category')
  const codexCategory = searchParams.get('codexCategory')
  const codexSubcategory = searchParams.get('codexSubcategory')
  const search = searchParams.get('q')
  
  // Normalize category to lowercase (n8n uses lowercase: 'trigger', 'input', 'transform', 'output')
  const category = categoryRaw ? categoryRaw.toLowerCase() : null
  
  const hasSearch = search && search !== 'undefined' && search.trim() !== ''
  const hasCategory = category && category !== 'undefined' && category !== 'all'
  const hasCodexCategory = codexCategory && codexCategory !== 'undefined'
  const hasCodexSubcategory = codexSubcategory && codexSubcategory !== 'undefined'
  
  // ALWAYS USE PAGINATION via Elasticsearch
  // Never fetch all 847 nodes at once - let ES handle pagination
  const { getLucidL2Client } = await import('@/lib/lucid-l2/client')
  const client = getLucidL2Client()
  
  // Calculate offset from cursor
  const offset = cursor ? parseInt(cursor) : 0
  
  try {
    // Query Elasticsearch with offset/limit (ES handles pagination)
    const { nodes: rawNodes, total } = await client.getAvailableNodes({
      search: search || undefined,
      category: category || undefined,
      codexCategory: codexCategory || undefined,
      codexSubcategory: codexSubcategory || undefined,
      offset,
      limit
    })
    
    // Transform nodes
    const { transformNodes, deduplicateNodes, parseNodesResponse, DEMO_CRYPTO_NODES } = await import('@/lib/lucid-l2/node-service')
    const parsed = parseNodesResponse(rawNodes as Parameters<typeof parseNodesResponse>[0])
    const deduplicated = deduplicateNodes(parsed)
    let transformed = transformNodes(deduplicated)
    
    // DEMO: Inject crypto connectors
    transformed = [...transformed, ...DEMO_CRYPTO_NODES]

    // Calculate next cursor
    const nextOffset = offset + transformed.length
    const hasMore = total ? nextOffset < total : transformed.length >= limit
    
    return NextResponse.json({
      items: transformed,
      nextCursor: hasMore ? nextOffset.toString() : null,
      total
    })
  } catch (error: unknown) {
    console.error('[Nodes API] ❌ ERROR:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      category,
      categoryRaw,
      search,
      cursor,
      limit
    })
    
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/lucid-l2/nodes/route.ts',
        method: 'REQUEST',
        category,
        categoryRaw,
        search,
        cursor,
        limit
      },
      tags: {
        layer: 'api',
        route: 'lucid-l2-nodes'
      }
    });
    
    return NextResponse.json(
      { 
        items: [], 
        nextCursor: null, 
        error: error instanceof Error ? error.message : String(error),
        _debug: {
          category: category,
          categoryRaw: categoryRaw,
          endpoint: '/api/lucid-l2/nodes'
        }
      },
      { status: 500 }
    )
  }
}
