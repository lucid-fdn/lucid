/**
 * Company/Organization fetching (server-only)
 * Fetches org data and assets
 * Now uses DB facade for better maintainability
 */

import 'server-only';
import { companyBySlug, companyStats } from '@/ports/db';
import { searchAssets } from './search';
import { fetchOverlays } from './supabase';
import { mergeAssetsWithOverlays } from './merge';
import { UiAsset } from './types';
import { mockAssets } from './seed';
import { redactLogMetadata, summarizeError } from '@/lib/logging/safe-log';

export type Organization = {
  id: string;
  slug: string;
  display_name: string;
  verified: boolean;
  bio?: string;
  logo_url?: string;
  website_url?: string;
  socials?: Record<string, string>;
};

export type OrganizationStats = {
  assets_count: number;
  followers_count: number;
};

// Mock companies for development
const mockCompanies: Record<string, { org: Organization; stats: OrganizationStats }> = {
  'meta': {
    org: {
      id: 'mock-meta-id',
      slug: 'meta',
      display_name: 'Meta',
      verified: true,
      bio: 'Meta Platforms, Inc. - Building technologies that help people connect, find communities, and grow businesses.',
      logo_url: '/company/meta-logo.svg',
      website_url: 'https://about.meta.com',
      socials: {
        twitter: 'https://twitter.com/Meta',
        linkedin: 'https://linkedin.com/company/meta'
      }
    },
    stats: {
      assets_count: 1,
      followers_count: 0
    }
  }
};

const DEBUG_MARKETPLACE_COMPANY = process.env.DEBUG_MARKETPLACE_COMPANY === 'true';

function debugCompany(message: string, metadata?: Record<string, unknown>) {
  if (!DEBUG_MARKETPLACE_COMPANY) return;
  console.debug(`[company] ${message}`, redactLogMetadata(metadata));
}

/**
 * Fetch organization by slug
 * Uses DB facade - no direct Supabase dependency
 * Falls back to mock data if not found in database
 */
export async function fetchOrgBySlug(slug: string): Promise<{ org: Organization; stats: OrganizationStats } | null> {
  const startTime = performance.now();

  try {
    // Fetch org using DB facade (only public companies)
    const org = await companyBySlug(slug);

    if (!org) {
      const duration = performance.now() - startTime;
      debugCompany('Org not found in DB, checking mock data', { slug, durationMs: Math.round(duration) });
      
      // Fallback to mock data
      if (mockCompanies[slug]) {
        debugCompany('Using mock company data', { slug });
        return mockCompanies[slug];
      }
      
      return null;
    }

    // Filter out non-public companies
    if (org.is_public === false) {
      debugCompany('Organization is not public, denying access', { slug });
      return null;
    }

    // Fetch stats using DB facade
    const stats = await companyStats(org.id);

    const duration = performance.now() - startTime;
    debugCompany('Fetched organization', { slug, durationMs: Math.round(duration) });

    return { org: org as Organization, stats };
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error('[company] Failed to fetch organization:', {
      slug,
      durationMs: Math.round(duration),
      error: summarizeError(error),
    });
    
    // Fallback to mock data on error
    if (mockCompanies[slug]) {
      debugCompany('Falling back to mock company data', { slug });
      return mockCompanies[slug];
    }
    
    return null;
  }
}

/**
 * Fetch all assets for an organization
 */
export async function fetchOrgAssets(slug: string): Promise<UiAsset[]> {
  const startTime = performance.now();

  try {
    // Search by owner_org_slug
    const apiResponse = await searchAssets({
      owner_org_slug: slug,
      limit: 100,
    });

    const externalIds = apiResponse.assets.map(a => a.external_id);
    
    // Fetch overlays
    let overlays: Awaited<ReturnType<typeof fetchOverlays>> = [];
    try {
      overlays = externalIds.length > 0 ? await fetchOverlays(externalIds) : [];
    } catch (overlayError) {
      console.warn('[company] Overlay fetch failed, rendering ES only:', summarizeError(overlayError));
    }

    // Merge
    const assets = mergeAssetsWithOverlays(apiResponse.assets, overlays);

    const duration = performance.now() - startTime;
    debugCompany('Fetched organization assets', {
      slug,
      assetCount: assets.length,
      durationMs: Math.round(duration),
    });

    return assets;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error('[company] Failed to fetch assets:', {
      slug,
      durationMs: Math.round(duration),
      error: summarizeError(error),
    });
    
    // Fallback to mock data filtered by org
    const mockOrgAssets = mockAssets.filter(a => a.owner_org_slug === slug);
    if (mockOrgAssets.length > 0) {
      console.warn('[company] Falling back to mock data');
    }
    return mockOrgAssets;
  }
}
