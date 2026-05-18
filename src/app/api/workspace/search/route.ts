/**
 * Workspace Search API
 * 
 * Searches user's workspace data (agents, apps, favorites)
 * Returns user-specific results with higher priority
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/** Shape of an agent row from Supabase */
interface AgentRow {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  description?: string;
  config?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** Shape of an app row from Supabase */
interface AppRow {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  description?: string;
  config?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** Shape of a marketplace asset */
interface MarketplaceAsset {
  id: string;
  kind: string;
  name?: string;
  description?: string;
  provider?: string;
  icon_url?: string;
  [key: string]: unknown;
}

/** Shape of a favorite row with joined asset */
interface FavoriteRow {
  asset: MarketplaceAsset | MarketplaceAsset[] | null;
  created_at?: string;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse query params
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const types = searchParams.get('types')?.split(',').filter(Boolean);
    
    if (!query || query.length < 2) {
      return NextResponse.json({
        success: true,
        data: { results: [], total: 0 }
      });
    }
    
    const membershipRes = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)

    if (membershipRes.error) {
      throw membershipRes.error
    }

    const orgIds = [...new Set((membershipRes.data ?? [])
      .map((row) => row.organization_id)
      .filter((orgId): orgId is string => typeof orgId === 'string' && orgId.length > 0))]
    const searchTerm = `%${escapePostgrestLike(query)}%`;
    
    // Search across multiple tables in parallel
    const [agentsRes, appsRes, favoritesRes] = await Promise.all([
      // Search agents
      (!types || types.includes('AGENT')) && orgIds.length > 0 ?
        supabase
          .from('agents')
          .select('id, org_id, project_id, name, description, config, created_at, updated_at')
          .in('org_id', orgIds)
          .is('deleted_at', null)
          .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
          .limit(limit)
        : Promise.resolve({ data: [], error: null }),
      
      // Search apps
      (!types || types.includes('APP')) && orgIds.length > 0 ?
        supabase
          .from('apps')
          .select('id, org_id, project_id, name, description, config, created_at, updated_at')
          .in('org_id', orgIds)
          .is('deleted_at', null)
          .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
          .limit(limit)
        : Promise.resolve({ data: [], error: null }),
      
      // Search favorites
      supabase
        .from('favorites')
        .select('id, user_id, asset_id, created_at, asset:marketplace_assets(id, kind, name, description, provider, icon_url, created_at, updated_at)')
        .eq('user_id', userId)
        .limit(limit)
    ]);
    
    // Transform results
    const results = [
      ...((agentsRes.data || []) as AgentRow[]).map((agent) => ({
        id: agent.id,
        type: 'AGENT' as const,
        name: agent.name,
        description: agent.description,
        icon_url: readIconUrl(agent.config),
        metadata: agent,
        score: 1.0,
      })),
      ...((appsRes.data || []) as AppRow[]).map((app) => ({
        id: app.id,
        type: 'APP' as const,
        name: app.name,
        description: app.description,
        icon_url: readIconUrl(app.config),
        metadata: app,
        score: 1.0,
      })),
      ...((favoritesRes.data || []) as FavoriteRow[])
        .filter((fav) => {
          const asset = Array.isArray(fav.asset) ? fav.asset[0] : fav.asset;
          if (!asset) return false;
          if (types && !types.includes(asset.kind)) return false;
          const matchName = asset.name?.toLowerCase().includes(query.toLowerCase());
          const matchDesc = asset.description?.toLowerCase().includes(query.toLowerCase());
          return matchName || matchDesc;
        })
        .map((fav) => {
          const asset = (Array.isArray(fav.asset) ? fav.asset[0] : fav.asset)!;
          return {
            id: asset.id,
            type: asset.kind,
            name: asset.name,
            description: asset.description,
            provider: asset.provider,
            icon_url: asset.icon_url,
            metadata: {
              ...asset,
              favorited_at: fav.created_at,
            },
            bookmarked: true,
            score: 1.0,
          };
        })
    ];
    
    // Apply offset and limit
    const paginatedResults = results.slice(offset, offset + limit);
    
    return NextResponse.json({
      success: true,
      data: {
        results: paginatedResults,
        total: results.length,
      }
    });
    
   } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workspace/search/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Search failed' 
      },
      { status: 500 }
    );
  }
}

function escapePostgrestLike(value: string): string {
  return value
    .trim()
    .replace(/[(),]/g, ' ')
    .replace(/[%_]/g, (match) => `\\${match}`)
}

function readIconUrl(config: Record<string, unknown> | null | undefined): string | undefined {
  const iconUrl = config?.icon_url ?? config?.iconUrl ?? config?.logo_url ?? config?.logoUrl
  return typeof iconUrl === 'string' ? iconUrl : undefined
}
