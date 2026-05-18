/**
 * Marketplace Service Layer
 *
 * Centralized business logic for marketplace operations
 * Industry standard: Service Layer Pattern (Netflix, Airbnb, Uber)
 *
 * Benefits:
 * - Single source of truth
 * - Reusable across pages, API routes, components
 * - Encapsulates complexity (endpoint selection, error handling)
 * - Easy to test and maintain
 * - DRY principle
 *
 * Architecture:
 * - Uses SearchOrchestrator for multi-source search (AI Aggregator + Lucid L2)
 * - Parallel execution for speed
 * - Graceful degradation on errors
 */

import { SearchOrchestrator } from '@/lib/search/orchestrator';
import { AIAggregatorAdapter } from '@/lib/search/adapters/ai-aggregator';
import { LucidL2Adapter } from '@/lib/search/adapters/lucid-l2-adapter';
import type { SearchResult, ResourceType } from '@/lib/search/adapters/base';
import { enrichAssets } from './merger';
import type { AIResource } from './ai-aggregator-client';
import { SearchFilters } from './types';
import { WEB3_CONNECTORS } from './curated-content';

export interface Asset {
  id: string;
  external_id: string;
  name: string;
  kind: string;
  provider?: string;
  description?: string;
  tags?: string[];
  // Supabase overlays
  is_bookmarked?: boolean;
  user_rating?: number;
  avg_rating?: number;
  rating_count?: number;
  // Icon/Logo URLs (centralized from adapters)
  icon_url?: string;
  icon_url_dark?: string; // Dark mode variant
  logo_url?: string;
  // Full metadata from search result (extensibility)
  metadata?: Record<string, unknown>;
  // ... other fields
}

export interface AssetsResponse {
  assets: Asset[];
  total: number;
  cursor?: string;
}

/**
 * Marketplace Service
 * High-level API for marketplace operations
 */
export class MarketplaceService {
  private orchestrator: SearchOrchestrator;

  constructor() {
    // Initialize with all available adapters
    this.orchestrator = new SearchOrchestrator([
      new AIAggregatorAdapter(),
      new LucidL2Adapter()
    ]);
  }

  /**
   * Transform SearchResult to Asset format
   * Industry standard: Normalize data at transform layer
   */
  private transformResult(result: SearchResult): Asset {
    return {
      id: result.id,
      external_id: result.external_id,
      name: result.name,
      kind: result.type,
      provider: result.provider,
      description: result.description,
      tags: (result.metadata?.tags as string[]) || [],
      is_bookmarked: result.userMeta?.bookmarked,
      user_rating: result.userMeta?.rating,
      avg_rating: result.metadata?.rating_avg as number | undefined,
      rating_count: result.metadata?.rating_count as number | undefined,
      // Icon/Logo URLs (centralized at adapter level)
      icon_url: result.icon_url || result.logo_url || (result.metadata?.icon_url as string | undefined),
      icon_url_dark: result.icon_url_dark, // Dark mode variant from adapter
      logo_url: result.logo_url || result.icon_url,
      // Preserve full metadata for extensibility
      metadata: result.metadata,
    };
  }

  /**
   * Get popular models (sorted by downloads)
   * Use case: Browse page, model picker, recommendations
   */
  async getPopularModels(options?: {
    limit?: number;
    offset?: number;
    provider?: string;
  }): Promise<AssetsResponse> {
    try {
      // Use orchestrator for unified search
      const results = await this.orchestrator.search({
        q: '', // Empty query = browse mode
        types: ['MODEL'],
        limit: options?.limit || 24,
        offset: options?.offset || 0,
      });

      // Transform to Asset format
      const assets = results.map(r => this.transformResult(r));

      // Enrich with Supabase overlay data
      const enrichedAssets = await enrichAssets(assets as unknown as AIResource[]);

      return {
        assets: enrichedAssets,
        total: assets.length,
      };
    } catch {
      return { assets: [], total: 0 };
    }
  }

  /**
   * Search assets across all types
   * Use case: Search bar, explore page with query
   */
  async searchAssets(options: {
    query: string;
    types?: string[];
    limit?: number;
    offset?: number;
  }): Promise<AssetsResponse> {
    try {
      // Use orchestrator for multi-source search
      const results = await this.orchestrator.search({
        q: options.query,
        types: options.types as ResourceType[] | undefined,
        limit: options.limit || 24,
        offset: options.offset || 0,
      });

      // Transform to Asset format
      const assets = results.map(r => this.transformResult(r));

      // Enrich with Supabase overlay data
      const enrichedAssets = await enrichAssets(assets as unknown as AIResource[]);

      return {
        assets: enrichedAssets,
        total: assets.length,
      };
    } catch {
      return { assets: [], total: 0 };
    }
  }

  /**
   * Get assets with smart endpoint selection
   * Use case: Explore page (browse or search)
   *
   * Industry Standard: Netflix/Spotify pattern for curated collections
   * - If IDs provided: fetch specific assets (preserving order)
   * - If no IDs: browse/search mode
   * - Graceful fallback: missing assets are filtered out
   */
  async getAssets(filters: SearchFilters): Promise<AssetsResponse> {
    try {
      // CURATED MODE: Fetch specific assets by ID (Netflix/Spotify pattern)
      if (filters.ids && filters.ids.length > 0) {
        // Fetch all IDs in parallel (faster than sequential)
        const assetPromises = filters.ids.map(async (id) => {
          try {
            // STATIC CONNECTORS: Check if this is a Web3 connector (marketing placeholder)
            if ((filters.kind as string) === 'CONNECTOR') {
              const staticConnector = WEB3_CONNECTORS.find(c => c.id === id);
              if (staticConnector) {
                return {
                  id: staticConnector.id,
                  external_id: staticConnector.external_id,
                  name: staticConnector.name,
                  kind: 'CONNECTOR', // Correct type
                  provider: staticConnector.provider,
                  description: staticConnector.description,
                  tags: staticConnector.tags,
                  icon_url: staticConnector.icon_url,
                  logo_url: staticConnector.logo_url,
                  metadata: staticConnector.metadata,
                } as Asset;
              }
            }

            const results = await this.orchestrator.search({
              q: id, // Search by ID/slug
              types: filters.kind ? [filters.kind as ResourceType] : undefined,
              limit: 1,
            });

            if (results.length === 0) {
              return null;
            }

            // Transform and return
            const asset = this.transformResult(results[0]);

            return asset;
          } catch {
            return null; // Graceful fallback
          }
        });

        // Wait for all fetches (parallel execution)
        const fetchedAssets = await Promise.all(assetPromises);

        // Filter out nulls (missing assets) and preserve order
        const validAssets = fetchedAssets.filter(a => a !== null) as Asset[];

        // Enrich with Supabase overlay data
        const enrichedAssets = await enrichAssets(validAssets as unknown as AIResource[]);

        return {
          assets: enrichedAssets,
          total: enrichedAssets.length,
        };
      }

      // BROWSE/SEARCH MODE: Use standard search
      const results = await this.orchestrator.search({
        q: filters.q || '', // Empty query = browse mode
        types: filters.kind ? [filters.kind as ResourceType] : undefined,
        limit: filters.limit || 24,
        offset: filters.offset || 0,
      });

      // Transform to Asset format
      const assets = results.map(r => this.transformResult(r));

      // Enrich with Supabase overlay data
      const enrichedAssets = await enrichAssets(assets as unknown as AIResource[]);

      return {
        assets: enrichedAssets,
        total: assets.length,
      };
    } catch {
      return { assets: [], total: 0 };
    }
  }

  /**
   * Get datasets
   * Use case: Dataset browser, data marketplace
   */
  async getDatasets(options?: {
    limit?: number;
    offset?: number;
  }): Promise<AssetsResponse> {
    try {
      const results = await this.orchestrator.search({
        q: '',
        types: ['DATASET'],
        limit: options?.limit || 24,
        offset: options?.offset || 0,
      });

      const assets = results.map(r => this.transformResult(r));
      const enrichedAssets = await enrichAssets(assets as unknown as AIResource[]);

      return {
        assets: enrichedAssets,
        total: assets.length,
      };
    } catch {
      return { assets: [], total: 0 };
    }
  }

  /**
   * Get agents
   * Use case: Agent marketplace, playground
   */
  async getAgents(options?: {
    limit?: number;
    offset?: number;
  }): Promise<AssetsResponse> {
    try {
      const results = await this.orchestrator.search({
        q: '',
        types: ['AGENT'],
        limit: options?.limit || 24,
        offset: options?.offset || 0,
      });

      const assets = results.map(r => this.transformResult(r));
      const enrichedAssets = await enrichAssets(assets as unknown as AIResource[]);

      return {
        assets: enrichedAssets,
        total: assets.length,
      };
    } catch {
      return { assets: [], total: 0 };
    }
  }

  /**
   * Get connectors
   * Use case: Connector marketplace, workflow builder
   */
  async getConnectors(options?: {
    limit?: number;
    offset?: number;
  }): Promise<AssetsResponse> {
    try {
      const results = await this.orchestrator.search({
        q: '',
        types: ['CONNECTOR'],
        limit: options?.limit || 24,
        offset: options?.offset || 0,
      });

      const assets = results.map(r => this.transformResult(r));
      const enrichedAssets = await enrichAssets(assets as unknown as AIResource[]);

      return {
        assets: enrichedAssets,
        total: assets.length,
      };
    } catch {
      return { assets: [], total: 0 };
    }
  }

  /**
   * Get model by ID
   * Use case: Model detail page, playground model selector
   */
  async getModelById(modelId: string): Promise<Asset | null> {
    try {
      // Search for exact ID
      const response = await this.searchAssets({
        query: modelId,
        limit: 1,
      });

      return response.assets[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Get providers list
   * Use case: Provider filter, statistics
   * Note: This still uses direct API call as it's not search-based
   */
  async getProviders(): Promise<unknown[]> {
    try {
      // Providers list is not a search operation
      // Could be moved to a separate service or cached independently
      // TODO: Integrate with orchestrator
      return [];
    } catch {
      return [];
    }
  }
}

let marketplaceServiceInstance: MarketplaceService | null = null

export function getMarketplaceService(): MarketplaceService {
  if (!marketplaceServiceInstance) {
    marketplaceServiceInstance = new MarketplaceService()
  }
  return marketplaceServiceInstance
}

/**
 * Convenience functions for common operations
 * These use the singleton instance
 */

export async function getPopularModels(options?: {
  limit?: number;
  provider?: string;
}): Promise<AssetsResponse> {
  return getMarketplaceService().getPopularModels(options);
}

export async function searchMarketplace(query: string, options?: {
  limit?: number;
  types?: string[];
}): Promise<AssetsResponse> {
  return getMarketplaceService().searchAssets({
    query,
    ...options,
  });
}

export async function getAssets(filters: SearchFilters): Promise<AssetsResponse> {
  return getMarketplaceService().getAssets(filters);
}
