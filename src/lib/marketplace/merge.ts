/**
 * Pure function to merge ES assets with Supabase overlays
 * No N+1 queries - all overlays fetched once via IN (...)
 * De-duplicates by external_id to prevent duplicate cards
 */

import { ApiAsset, DbOverlay, UiAsset } from './types';

export function mergeAssetsWithOverlays(
  assets: ApiAsset[],
  overlays: DbOverlay[],
  bookmarkedAssetIds?: string[]
): UiAsset[] {
  // Build lookup map by external_id for O(1) access
  const overlayMap = new Map<string, DbOverlay>();
  overlays.forEach(ov => { if (ov.external_id) overlayMap.set(ov.external_id, ov); });

  const bookmarkSet = new Set(bookmarkedAssetIds || []);

  // De-duplicate by external_id (cursor pagination might overlap)
  const seen = new Set<string>();
  const merged: UiAsset[] = [];

  for (const asset of assets) {
    // Skip duplicates
    if (seen.has(asset.external_id)) {
      continue;
    }
    seen.add(asset.external_id);

    const overlay = overlayMap.get(asset.external_id);
    
    if (!overlay) {
      // No overlay found - render ES data only
      merged.push(asset);
      continue;
    }

    // Merge overlay data
    const { external_id: _, ...overlayData } = overlay;
    
    merged.push({
      ...asset,
      overlay: {
        ...overlayData,
        bookmarked: !!overlay.asset_row_id && bookmarkSet.has(overlay.asset_row_id),
      },
    });
  }

  return merged;
}
