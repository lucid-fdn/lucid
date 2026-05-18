/**
 * Asset detail fetching (server-only)
 * Fetches individual asset with overlay data
 */

import 'server-only';
import { ApiAsset, UiAsset } from './types';
import { fetchOverlays } from './supabase';
import { mergeAssetsWithOverlays } from './merge';
import { mockAssets } from './seed';

const ASSETS_API_BASE = process.env.ASSETS_API_BASE || '';

/**
 * Fetch asset by slug from ES API
 */
export async function fetchAssetBySlug(slug: string): Promise<ApiAsset | null> {
  const startTime = performance.now();

  // Fallback to mock if API not configured
  if (!ASSETS_API_BASE) {
    console.warn('[asset-detail] ASSETS_API_BASE not set, using mock data');
    const mockAsset = mockAssets.find((a: ApiAsset) => a.slug === slug);
    return mockAsset || null;
  }

  try {
    const url = `${ASSETS_API_BASE}/assets/${slug}`;
    const response = await fetch(url, {
      next: { revalidate: 60 },
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[asset-detail] Asset not found: ${slug}`);
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const asset: ApiAsset = await response.json();
    const duration = performance.now() - startTime;
    console.log(`[asset-detail] Fetched ${slug} in ${duration.toFixed(0)}ms`);
    
    return asset;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`[asset-detail] Failed to fetch ${slug} after ${duration.toFixed(0)}ms:`, error);
    
    // Fallback to mock
    const mockAsset = mockAssets.find((a: ApiAsset) => a.slug === slug);
    if (mockAsset) {
      console.warn('[asset-detail] Falling back to mock data');
      return mockAsset;
    }
    
    return null;
  }
}

/**
 * Fetch asset detail with overlay data
 */
export async function fetchAssetDetail(slug: string): Promise<UiAsset | null> {
  const startTime = performance.now();

  // Fetch base asset
  const asset = await fetchAssetBySlug(slug);
  if (!asset) {
    return null;
  }

  // Fetch overlay data
  try {
    const overlays = await fetchOverlays([asset.external_id]);
    const merged = mergeAssetsWithOverlays([asset], overlays);
    
    const duration = performance.now() - startTime;
    console.log(`[asset-detail] Fetched detail for ${slug} in ${duration.toFixed(0)}ms`);
    
    return merged[0] || null;
  } catch (error) {
    console.warn('[asset-detail] Overlay fetch failed, returning ES data only:', error);
    return asset; // Return without overlay if it fails
  }
}
