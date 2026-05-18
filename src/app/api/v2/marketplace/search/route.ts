/**
 * Marketplace Search API (v2)
 * 
 * BFF Pattern: Merges AI Aggregator catalog with Supabase overlay
 * Industry standard: Unified API that combines multiple data sources
 */

import { NextRequest, NextResponse } from 'next/server';
import { SearchOrchestrator } from '@/lib/search/orchestrator';
import { AIAggregatorAdapter } from '@/lib/search/adapters/ai-aggregator';
import { LucidL2Adapter } from '@/lib/search/adapters/lucid-l2-adapter';
import { WorkspaceAdapter } from '@/lib/search/adapters/workspace-adapter';
import { getServerAuth } from '@/lib/auth/server-utils';
import { checkRateLimit, RateLimitPresets } from '@/lib/auth/rate-limit';
import { ErrorService } from '@/lib/errors/error-service';
import type { AssetKind } from '@/lib/marketplace/types';

let orchestrator: SearchOrchestrator | null = null

function getSearchOrchestrator(): SearchOrchestrator {
  if (!orchestrator) {
    orchestrator = new SearchOrchestrator([
      new WorkspaceAdapter(), // Priority 200 - User's data first!
      new AIAggregatorAdapter(), // Priority 100 - External catalog
      new LucidL2Adapter() // Priority 50 - n8n nodes
    ])
  }
  return orchestrator
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v2/marketplace/search
 * 
 * Search marketplace assets with enriched data
 * 
 * Query params:
 * - q: Search query
 * - kind: MODEL | DATASET | AGENT | COMPUTE | APP
 * - limit: Results per page (default: 24, max: 100)
 * - offset: Pagination offset
 */
export async function GET(request: NextRequest) {
  const startTime = performance.now();
  
  try {
    // Auth & rate limiting
    const { userId } = await getServerAuth();
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    const identifier = userId || ip;
    
    // Apply relaxed rate limit for marketplace search (20 req/min)
    const rateLimitResult = await checkRateLimit(identifier, RateLimitPresets.RELAXED);
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
          retry_after: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetAt.toString()
          }
        }
      );
    }
    
    // Parse & validate query params
    const { searchParams } = new URL(request.url);
    
    const q = searchParams.get('q') || undefined;
    const kind = searchParams.get('kind') as AssetKind | null || undefined;
    const sort = searchParams.get('sort') || 'downloads'; // Default stable sort
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '24'),
      100 // Max 100 results per request
    );
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // Validate kind if provided
    const validKinds = ['MODEL', 'DATASET', 'AGENT', 'COMPUTE', 'APP'];
    if (kind && !validKinds.includes(kind)) {
      return NextResponse.json(
        { 
          success: false,
          error: `Invalid kind. Must be one of: ${validKinds.join(', ')}` 
        },
        { status: 400 }
      );
    }
    
    // Use composable search orchestrator
    const results = await getSearchOrchestrator().search({
      q: q || '',
      types: kind ? [kind] : undefined,
      sort,
      limit,
      offset,
      userId: userId || undefined
    });
    
    const duration = performance.now() - startTime;
    
    return NextResponse.json({
      success: true,
      data: {
        results,
        total: results.length,
        offset,
        limit,
        sources: getSearchOrchestrator().getAdapters().map(a => a.name)
      }
    }, {
      headers: {
        // Cache for 60 seconds
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        'X-Response-Time': `${duration.toFixed(0)}ms`,
      }
    });
    
  } catch (error) {
    const _duration = performance.now() - startTime;

    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/v2/marketplace/search/route.ts',
        method: 'REQUEST',
        stack: error instanceof Error ? error.stack : undefined
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to search marketplace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
