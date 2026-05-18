import { NextRequest, NextResponse } from 'next/server';
import { searchAssets } from '@/lib/marketplace/search';
import { fetchOverlays } from '@/lib/marketplace/supabase';
import { mergeAssetsWithOverlays } from '@/lib/marketplace/merge';
import { SearchFilters } from '@/lib/marketplace/types';
import { ErrorService } from '@/lib/errors/error-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // Fix: Don't try to statically render
export const revalidate = 60; // Edge cache for 60s

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Build filters from query params
    const filters: SearchFilters = {
      q: searchParams.get('q') || undefined,
      kind: searchParams.get('kind') as SearchFilters['kind'] || undefined,
      tags: searchParams.get('tags')?.split(',') || undefined,
      sort: searchParams.get('sort') as SearchFilters['sort'] || undefined,
      p95_lte: searchParams.get('p95_lte') ? parseInt(searchParams.get('p95_lte')!, 10) : undefined,
      price_lte: searchParams.get('price_lte') ? parseFloat(searchParams.get('price_lte')!) : undefined,
      eu_only: searchParams.get('eu_only') === 'true',
      cc_on: searchParams.get('cc_on') === 'true',
      cursor: searchParams.get('cursor') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 24,
    };

    // Fetch from ES/API with edge caching
    const apiResponse = await searchAssets(filters);
    const externalIds = apiResponse.assets.map(a => a.external_id);

    // Fetch overlays in parallel (graceful degradation)
    let overlays: Awaited<ReturnType<typeof fetchOverlays>> = [];
    try {
      overlays = externalIds.length > 0 ? await fetchOverlays(externalIds) : [];
    } catch (overlayError) {
      console.warn('[api/marketplace/search] Overlay fetch failed, rendering ES only:', overlayError);
      // Continue with empty overlays - graceful degradation
    }

    // Merge with de-duplication
    const assets = mergeAssetsWithOverlays(apiResponse.assets, overlays);

    return NextResponse.json({
      assets,
      cursor: apiResponse.cursor,
      total: apiResponse.total,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      }
    });

  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/marketplace/search/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to fetch assets' },
      { status: 500 }
    );
  }
}
