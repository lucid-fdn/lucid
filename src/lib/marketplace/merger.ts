/**
 * Data Merger - Comprehensive Overlay Pattern
 * 
 * Merges AI Aggregator catalog data with Supabase user/org overlay data
 * Industry standard: Separate catalog (source) from user interactions (overlay)
 * 
 * FETCHES EVERYTHING from both sources:
 * - AI Aggregator: Complete asset data (models, datasets, agents, etc.)
 * - Supabase: All user interactions (likes, bookmarks, ratings, comments, etc.)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AIResource } from './ai-aggregator-client';

let _supabase: SupabaseClient | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabase;
}

export interface EnrichedAsset {
  // From AI Aggregator (source of truth for asset data)
  id: string;
  external_id: string;
  name: string;
  kind: 'MODEL' | 'DATASET' | 'AGENT' | 'COMPUTE' | 'APP';
  provider?: string;
  description?: string;
  tags?: string[];
  // Normalized fields from adapters
  icon_url?: string;
  icon_url_dark?: string; // Dark mode variant
  logo_url?: string;
  metadata?: Record<string, unknown>;
  
  // From Supabase (user/org overlay data)
  overlay?: {
    // Aggregated stats
    rating_avg?: number;
    rating_count?: number;
    likes_count?: number;
    bookmarks_count?: number;
    comments_count?: number;
    runs_count?: number;
    runs_count_30d?: number;
    proven_runs?: number;
    
    // User-specific data
    liked?: boolean;
    bookmarked?: boolean;
    user_rating?: number;
    user_comment?: string;
    
    // Organization data
    owner_org?: {
      id: string;
      name: string;
      slug: string;
      verified: boolean;
      logo_url?: string;
      description?: string;
    };
    
    // Contributors
    contributors?: Array<{
      id: string;
      handle: string;
      name?: string;
      avatar_url?: string;
    }>;
    
    // Additional metadata from Supabase
    created_at?: string;
    updated_at?: string;
    visibility?: 'PUBLIC' | 'PRIVATE' | 'ORG_ONLY';
  };
}

/**
 * Comprehensive data merge - fetches EVERYTHING
 * 
 * @param aiAssets - Assets from AI Aggregator API
 * @param userId - Current user ID (for user-specific data)
 * @returns Enriched assets with complete overlay data
 */
export async function enrichAssets(
  aiAssets: AIResource[],
  userId?: string
): Promise<EnrichedAsset[]> {
  if (aiAssets.length === 0) return [];
  
  // Extract external IDs
  const externalIds = aiAssets.map(a => a.id);
  
  try {
    // ===== FETCH ALL SUPABASE DATA =====
    
    // 1. Base asset data + organization info
    const { data: overlays } = await getSupabase()
      .from('assets')
      .select(`
        external_id,
        owner_org_id,
        rating,
        proven_runs,
        visibility,
        created_at,
        updated_at,
        organizations(
          id,
          name,
          slug,
          verified,
          logo_url
        )
      `)
      .in('external_id', externalIds);
    
    // 2. Aggregated stats (materialized view)
    let stats: Record<string, unknown>[] = [];
    try {
      const { data: statsData } = await getSupabase()
        .from('asset_stats')
        .select('external_id, rating_avg, rating_count, likes_count, bookmark_count, runs_count, runs_count_30d')
        .in('external_id', externalIds);
      stats = (statsData as Record<string, unknown>[]) || [];
    } catch (error) {
      console.warn('[merger] asset_stats view not available:', error);
    }
    
    // 3. Like counts (aggregate)
    const { data: likeCounts } = await getSupabase()
      .from('asset_likes')
      .select('asset_id, assets!inner(external_id)')
      .in('assets.external_id', externalIds);
    
    const likeCountMap = new Map<string, number>();
    likeCounts?.forEach(l => {
      if (l.assets && 'external_id' in l.assets) {
        const extId = (l.assets as unknown as { external_id: string }).external_id;
        likeCountMap.set(extId, (likeCountMap.get(extId) || 0) + 1);
      }
    });
    
    // 4. Bookmark counts (aggregate)
    const { data: bookmarkCounts } = await getSupabase()
      .from('bookmarks')
      .select('asset_id, assets!inner(external_id)')
      .in('assets.external_id', externalIds);
    
    const bookmarkCountMap = new Map<string, number>();
    bookmarkCounts?.forEach(b => {
      if (b.assets && 'external_id' in b.assets) {
        const extId = (b.assets as unknown as { external_id: string }).external_id;
        bookmarkCountMap.set(extId, (bookmarkCountMap.get(extId) || 0) + 1);
      }
    });
    
    // 5. Rating aggregates (try/catch for graceful fallback)
    interface RatingAgg { external_id: string; avg?: number; count?: number }
    let ratingAggs: RatingAgg[] = [];
    try {
      const { data } = await getSupabase()
        .rpc('get_asset_rating_stats', { asset_external_ids: externalIds });
      ratingAggs = (data as RatingAgg[]) || [];
    } catch (error) {
      console.warn('[merger] get_asset_rating_stats not available:', error);
    }

    const ratingAggMap = new Map(
      ratingAggs.map((r) => [r.external_id, r])
    );
    
    // 6. User-specific data (if authenticated)
    let userLikes: Set<string> = new Set();
    let userBookmarks: Set<string> = new Set();
    let userRatings: Map<string, { score: number; comment?: string }> = new Map();
    
    if (userId) {
      // User's likes
      const { data: likes } = await getSupabase()
        .from('asset_likes')
        .select('asset_id, assets!inner(external_id)')
        .eq('user_id', userId)
        .in('assets.external_id', externalIds);
      
      likes?.forEach(l => {
        if (l.assets && 'external_id' in l.assets) {
          userLikes.add((l.assets as unknown as { external_id: string }).external_id);
        }
      });
      
      // User's bookmarks
      const { data: bookmarks } = await getSupabase()
        .from('bookmarks')
        .select('asset_id, assets!inner(external_id)')
        .eq('user_id', userId)
        .in('assets.external_id', externalIds);
      
      bookmarks?.forEach(b => {
        if (b.assets && 'external_id' in b.assets) {
          userBookmarks.add((b.assets as unknown as { external_id: string }).external_id);
        }
      });
      
      // User's ratings
      const { data: ratings } = await getSupabase()
        .from('ratings')
        .select('score, comment, asset_id, assets!inner(external_id)')
        .eq('user_id', userId)
        .in('assets.external_id', externalIds);
      
      ratings?.forEach(r => {
        if (r.assets && 'external_id' in r.assets) {
          userRatings.set((r.assets as unknown as { external_id: string }).external_id, {
            score: r.score,
            comment: r.comment || undefined
          });
        }
      });
    }
    
    // ===== CREATE LOOKUP MAPS =====
    
    const overlayMap = new Map(
      overlays?.map(o => [o.external_id, o]) || []
    );
    
    const statsMap = new Map(
      stats.map(s => [s.external_id, s])
    );
    
    // ===== MERGE ALL DATA =====
    
    return aiAssets.map(asset => {
      const overlay = overlayMap.get(asset.id);
      const assetStats = statsMap.get(asset.id);
      const ratingAgg = ratingAggMap.get(asset.id);
      const userRating = userRatings.get(asset.id);
      
      // Map 'type' field to 'kind' if needed (Elastic API uses 'type')
      const assetKind = (asset.kind || (asset as Record<string, unknown>).type || 'MODEL') as string;

      return {
        // AI Aggregator data (source of truth)
        id: asset.id,
        external_id: asset.id,
        name: asset.name,
        kind: assetKind.toUpperCase() as EnrichedAsset['kind'],
        provider: asset.provider,
        description: asset.description,
        tags: asset.tags || [],
        // Preserve normalized fields from adapters
        icon_url: (asset as Record<string, unknown>).icon_url as string | undefined,
        icon_url_dark: (asset as Record<string, unknown>).icon_url_dark as string | undefined,
        logo_url: (asset as Record<string, unknown>).logo_url as string | undefined,
        metadata: (asset as Record<string, unknown>).metadata as Record<string, unknown> | undefined,

        // Supabase overlay (complete)
        overlay: {
          // Aggregated stats
          rating_avg: ratingAgg?.avg || (assetStats?.rating_avg as number | undefined) || overlay?.rating,
          rating_count: ratingAgg?.count || (assetStats?.rating_count as number | undefined) || 0,
          likes_count: likeCountMap.get(asset.id) || (assetStats?.likes_count as number | undefined) || 0,
          bookmarks_count: bookmarkCountMap.get(asset.id) || (assetStats?.bookmark_count as number | undefined) || 0,
          runs_count: (assetStats?.runs_count as number | undefined) || overlay?.proven_runs || 0,
          runs_count_30d: assetStats?.runs_count_30d as number | undefined,
          proven_runs: overlay?.proven_runs,
          
          // User-specific
          liked: userLikes.has(asset.id),
          bookmarked: userBookmarks.has(asset.id),
          user_rating: userRating?.score,
          user_comment: userRating?.comment,
          
          // Organization
          owner_org: overlay?.organizations ? (() => {
            const org = overlay.organizations as unknown as { id: string; name: string; slug: string; verified: boolean; logo_url?: string };
            return {
              id: org.id,
              name: org.name,
              slug: org.slug,
              verified: org.verified,
              logo_url: org.logo_url,
            };
          })() : undefined,

          // Metadata
          created_at: overlay?.created_at,
          updated_at: overlay?.updated_at,
          visibility: overlay?.visibility as EnrichedAsset['overlay'] extends { visibility?: infer V } ? V : undefined,
        }
      };
    });
    
  } catch (error) {
    console.error('[merger] Failed to enrich assets:', error);
    
    // Graceful degradation: return AI Aggregator data only
    return aiAssets.map(asset => {
      const assetKind = ((asset.kind || (asset as Record<string, unknown>).type || 'MODEL') as string).toUpperCase();
      return {
        id: asset.id,
        external_id: asset.id,
        name: asset.name,
        kind: assetKind as EnrichedAsset['kind'],
        provider: asset.provider,
        description: asset.description,
        tags: asset.tags || [],
        overlay: undefined,
      };
    });
  }
}

/**
 * Merge single asset (for detail pages)
 * Fetches complete data for one asset
 * 
 * @param aiAsset - Single asset from AI Aggregator
 * @param userId - Current user ID
 * @returns Enriched asset with complete overlay
 */
export async function enrichAsset(
  aiAsset: AIResource,
  userId?: string
): Promise<EnrichedAsset> {
  const enriched = await enrichAssets([aiAsset], userId);
  return enriched[0];
}
