/**
 * Supabase overlay layer
 * Single IN (...) query for all assets, no N+1
 * SERVER-ONLY - Never runs in browser
 * 
 * Now uses DB facade for better maintainability
 */

import 'server-only';
import { overlaysByExternalIds, getUserBookmarks } from '@/ports/db';
import { DbOverlay } from './types';

/**
 * Fetch overlays for multiple assets in one query
 * Uses DB facade - no direct Supabase dependency
 */
export async function fetchOverlays(externalIds: string[]): Promise<DbOverlay[]> {
  const startTime = performance.now();

  if (externalIds.length === 0) {
    return [];
  }

  try {
    const data = await overlaysByExternalIds(externalIds);
    const duration = performance.now() - startTime;

    console.log(`[marketplace/supabase] Fetched ${data.length} overlays in ${duration.toFixed(0)}ms`);

    // Transform to DbOverlay format
    const overlays: DbOverlay[] = data.map((row: Record<string, unknown>) => ({
      external_id: row.external_id as string | undefined,
      asset_row_id: row.asset_row_id as string | undefined,
      rating_avg: row.rating_avg as number | undefined,
      rating_count: row.rating_count as number | undefined,
      proven_runs: row.proven_runs as number | undefined,
      reliability: row.reliability as number | undefined,
      runs_count_30d: row.runs_count_30d as number | undefined,
    }));

    return overlays;

  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`[marketplace/supabase] Exception after ${duration.toFixed(0)}ms:`, error);
    return [];
  }
}

/**
 * Fetch user's bookmarks (if authenticated)
 * Returns asset_row_ids that are bookmarked
 * Uses DB facade - no direct Supabase dependency
 */
export async function fetchBookmarks(userId: string, assetRowIds: string[]): Promise<string[]> {
  if (!userId || assetRowIds.length === 0) {
    return [];
  }

  try {
    const bookmarks = await getUserBookmarks(userId);
    
    // Filter to only the asset_row_ids we're interested in
    const bookmarkedIds = bookmarks
      .map(b => b.asset_id)
      .filter(id => assetRowIds.includes(id));

    return bookmarkedIds;

  } catch (error) {
    console.error('[marketplace/supabase] Bookmark exception:', error);
    return [];
  }
}
