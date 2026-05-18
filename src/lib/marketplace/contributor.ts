/**
 * Contributor fetching (server-only)
 * Fetches individual contributor data and their assets (without company)
 * Now uses DB facade for better maintainability
 */

import 'server-only';
import { contributorByHandle as getContributorByHandle } from '@/ports/db';
import { searchAssets } from './search';
import { fetchOverlays } from './supabase';
import { mergeAssetsWithOverlays } from './merge';
import { UiAsset } from './types';
import { mockAssets } from './seed';
import { maskIdentifier } from '@/lib/logging/safe-log';

export type Contributor = {
  handle: string;
  name?: string;
  avatar_url?: string;
  bio?: string;
};

/**
 * Fetch contributor by handle
 * Uses DB facade - no direct Supabase dependency
 */
export async function fetchContributorByHandle(handle: string): Promise<Contributor | null> {
  const startTime = performance.now();

  try {
    // Use DB facade
    const contributor = await getContributorByHandle(handle);

    if (!contributor) {
      const duration = performance.now() - startTime;
      console.log('[contributor] Contributor not found', {
        handle: maskIdentifier(handle),
        duration_ms: Number(duration.toFixed(0)),
      });
      return null;
    }

    const duration = performance.now() - startTime;
    console.log('[contributor] Fetched contributor', {
      handle: maskIdentifier(handle),
      duration_ms: Number(duration.toFixed(0)),
    });

    return contributor as Contributor;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.warn(`[contributor] Failed to fetch ${handle} after ${duration.toFixed(0)}ms:`, error);
    return null;
  }
}

/**
 * Fetch all assets for a contributor
 * IMPORTANT: Only returns assets WITHOUT owner_org_slug (personal assets)
 */
export async function fetchContributorAssets(handle: string): Promise<UiAsset[]> {
  const startTime = performance.now();

  try {
    // Search by owner_user_handle
    const apiResponse = await searchAssets({
      owner_user_handle: handle,
      limit: 100,
    });

    // CLIENT-SIDE FILTER: Remove any assets with owner_org_slug
    // This is a safety check in case API returns incorrect data
    const personalAssets = apiResponse.assets.filter(a => !a.owner_org_slug);

    if (personalAssets.length !== apiResponse.assets.length) {
      console.warn(
        `[contributor] Filtered out ${apiResponse.assets.length - personalAssets.length} company assets for ${handle}`
      );
    }

    const externalIds = personalAssets.map(a => a.external_id);
    
    // Fetch overlays
    let overlays: Awaited<ReturnType<typeof fetchOverlays>> = [];
    try {
      overlays = externalIds.length > 0 ? await fetchOverlays(externalIds) : [];
    } catch (overlayError) {
      console.warn('[contributor] Overlay fetch failed, rendering ES only:', overlayError);
    }

    // Merge
    const assets = mergeAssetsWithOverlays(personalAssets, overlays);

    const duration = performance.now() - startTime;
    console.log(`[contributor] Fetched ${assets.length} personal assets for ${handle} in ${duration.toFixed(0)}ms`);

    return assets;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`[contributor] Failed to fetch assets for ${handle} after ${duration.toFixed(0)}ms:`, error);
    
    // Fallback to mock data filtered by handle AND without company
    const mockContributorAssets = mockAssets.filter(
      a => a.owner_user_handle === handle && !a.owner_org_slug
    );
    
    if (mockContributorAssets.length > 0) {
      console.warn('[contributor] Falling back to mock data');
    }
    
    return mockContributorAssets;
  }
}
