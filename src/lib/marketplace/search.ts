/**
 * ES search layer with mock fallback
 * Builds query from URL params, fetches assets
 */

import { ApiResponse, SearchFilters } from './types';
import { mockAssets } from './seed';

const ASSETS_API_BASE = process.env.ASSETS_API_BASE || process.env.NEXT_PUBLIC_ASSETS_API_BASE;

export async function searchAssets(filters: SearchFilters): Promise<ApiResponse> {
  const startTime = performance.now();

  // If no API configured, use mock data
  if (!ASSETS_API_BASE) {
    console.warn('[marketplace/search] ASSETS_API_BASE not set, using mock data');
    return paginateMockAssets(filters);
  }

  try {
    const url = buildSearchUrl(filters);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      next: { revalidate: 60 }, // Edge cache for 60s
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[marketplace/search] API returned ${response.status}, falling back to mock`);
      return paginateMockAssets(filters);
    }

    const data: ApiResponse = await response.json();
    const duration = performance.now() - startTime;
    
    console.log(`[marketplace/search] ES fetch completed in ${duration.toFixed(0)}ms, ${data.assets.length} assets`);
    
    return data;

  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`[marketplace/search] Failed after ${duration.toFixed(0)}ms:`, error);
    console.warn('[marketplace/search] Falling back to mock data');
    return paginateMockAssets(filters);
  }
}

function buildSearchUrl(filters: SearchFilters): string {
  const params = new URLSearchParams();
  
  if (filters.q) params.set('q', filters.q);
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.tags?.length) params.set('tags', filters.tags.join(','));
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.p95_lte) params.set('p95_lte', filters.p95_lte.toString());
  if (filters.price_lte) params.set('price_lte', filters.price_lte.toString());
  if (filters.eu_only) params.set('eu_only', 'true');
  if (filters.cc_on) params.set('cc_on', 'true');
  
  // CRITICAL: Pass owner filters to ES for efficient filtering
  if (filters.owner_org_slug) params.set('owner_org_slug', filters.owner_org_slug);
  if (filters.owner_user_handle) params.set('owner_user_handle', filters.owner_user_handle);
  
  if (filters.cursor) params.set('cursor', filters.cursor);
  params.set('limit', (filters.limit || 24).toString());

  return `${ASSETS_API_BASE}/search?${params.toString()}`;
}

/**
 * Client-side pagination of mock data
 * Supports basic filtering for demo purposes
 */
function paginateMockAssets(filters: SearchFilters): ApiResponse {
  let filtered = [...mockAssets];

  // Apply filters
  if (filters.kind) {
    filtered = filtered.filter(a => a.kind === filters.kind);
  }

  if (filters.q) {
    const q = filters.q.toLowerCase();
    filtered = filtered.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.summary?.toLowerCase().includes(q) ||
      a.tags?.some(t => t.toLowerCase().includes(q))
    );
  }

  if (filters.tags?.length) {
    filtered = filtered.filter(a =>
      filters.tags!.some(tag => a.tags?.includes(tag))
    );
  }

  if (filters.eu_only) {
    filtered = filtered.filter(a => a.eu_only);
  }

  if (filters.cc_on) {
    filtered = filtered.filter(a => a.cc_on);
  }

  if (filters.p95_lte) {
    filtered = filtered.filter(a => !a.p95_ms || a.p95_ms <= filters.p95_lte!);
  }

  if (filters.price_lte) {
    filtered = filtered.filter(a => !a.cost_per_tok || a.cost_per_tok <= filters.price_lte!);
  }

  // Owner filters (CRITICAL for company/contributor pages)
  if (filters.owner_org_slug) {
    filtered = filtered.filter(a => a.owner_org_slug === filters.owner_org_slug);
  }

  if (filters.owner_user_handle) {
    filtered = filtered.filter(a => a.owner_user_handle === filters.owner_user_handle);
  }

  // Simple sort
  if (filters.sort === 'rating') {
    filtered.sort((a, b) => (b.name < a.name ? 1 : -1)); // Placeholder
  }

  // Pagination
  const limit = filters.limit || 24;
  const page = filters.cursor ? parseInt(filters.cursor, 10) : 0;
  const start = page * limit;
  const end = start + limit;
  const paginated = filtered.slice(start, end);

  return {
    assets: paginated,
    cursor: end < filtered.length ? (page + 1).toString() : undefined,
    total: filtered.length,
  };
}
