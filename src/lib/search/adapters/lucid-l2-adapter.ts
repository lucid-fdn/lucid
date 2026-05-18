/**
 * Lucid L2 Adapter
 * 
 * Adapter for searching n8n connectors (847 nodes) from Lucid L2 API
 * Uses centralized CacheService for consistency
 * Uses centralized API normalizers for field mapping
 */

import type { SearchAdapter, SearchQuery, SearchResult } from './base';
import { getLucidL2Client } from '@/lib/lucid-l2/client';
import { nodeCache } from '@/lib/cache/service';
import { normalizeIconVariants, normalizeDescription, normalizeTags, normalizeProvider } from '@/lib/api/normalizers';
import { DEMO_CRYPTO_NODES } from '@/lib/lucid-l2/node-service';

export class LucidL2Adapter implements SearchAdapter {
  name = 'lucid-l2';
  priority = 100; // Same as AI Aggregator (interleaved results)
  
  async search(query: SearchQuery): Promise<SearchResult[]> {
    // Only return connectors if:
    // 1. No type filter, OR
    // 2. Type filter includes CONNECTOR
    if (query.types && !query.types.includes('CONNECTOR')) {
      return [];
    }
    
    const cacheKey = `lucid-l2:search:${JSON.stringify(query)}`;
    
    console.log('[lucid-l2-adapter] Search called:', {
      query: query.q,
      types: query.types,
      limit: query.limit,
      cacheKey
    });
    
    // Try cache first
    try {
      const cached = await nodeCache.get<SearchResult[]>(cacheKey);
      if (cached) {
        console.log('[lucid-l2-adapter] Cache HIT');
        return cached;
      }
      console.log('[lucid-l2-adapter] Cache MISS');
    } catch (error) {
      console.warn('[lucid-l2-adapter] Cache read failed:', error);
    }
    
    // Fetch from Lucid L2 API
    let nodes: Record<string, unknown>[] = [];
    try {
      const client = getLucidL2Client();
      const response = await client.getAvailableNodes({
        search: query.q || undefined,
        limit: query.limit || 24,
        offset: query.offset || 0
      });
      nodes = response.nodes;
    } catch (error: unknown) {
      // Log once per session type, then gracefully degrade
      const errorKey = `lucid-l2-error-logged`;
      const globalRecord = global as unknown as Record<string, unknown>;
      if (typeof global !== 'undefined' && !globalRecord[errorKey]) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[lucid-l2-adapter] Lucid-L2 API unavailable:', message);
        console.warn('[lucid-l2-adapter] Falling back to demo nodes only');
        globalRecord[errorKey] = true;
      }
      // Continue with empty nodes array - will use demo nodes below
      nodes = [];
    }
    
    try {
      
      // Transform to SearchResult format using centralized normalizers
      let results: SearchResult[] = nodes.map(node => {
        // Use centralized normalizers for ALL fields
        const iconVariants = normalizeIconVariants(node);
        const description = normalizeDescription(node);
        const provider = normalizeProvider(node);
        const tags = normalizeTags(node);
        
        return {
          id: node.name as string,
          external_id: node.name as string,
          type: 'CONNECTOR' as const,
          source: this.name,
          name: (node.displayName as string) || (node.name as string),
          description,
          provider: provider || 'n8n',
          // Theme-aware icons
          icon_url: iconVariants.light,
          icon_url_dark: iconVariants.dark,
          logo_url: iconVariants.light, // Alias for backwards compatibility
          metadata: {
            codex_category: node.codexCategory,
            category: node.category,
            icon_url: node.iconUrl, // Original preserved for debugging
            version: node.version,
            subtitle: node.subtitle,
            defaults: node.defaults,
            tags, // Normalized tags
          },
          score: 1.0
        };
      });
      
      // DEMO: Add crypto connectors to search results
      const demoResults: SearchResult[] = DEMO_CRYPTO_NODES
        .filter(node => {
          // If there's a search query, do EXACT match on node name
          if (!query.q) return true;
          const searchLower = query.q.toLowerCase();
          // EXACT match on node.name (most precise)
          if (node.name.toLowerCase() === searchLower) return true;
          // Fallback: check if displayName matches
          if (node.displayName.toLowerCase() === searchLower) return true;
          // No match
          return false;
        })
        .map(node => ({
          id: node.name,
          external_id: node.name,
          type: 'CONNECTOR' as const,
          source: this.name,
          name: node.displayName,
          description: node.description || '',
          provider: 'Web3',
          icon_url: node.iconUrl as string || node.icon,
          logo_url: node.iconUrl as string || node.icon,
          metadata: {
            category: node.category,
            tags: node.tags || [],
            usableAsTool: node.usableAsTool,
            popularityScore: node.popularityScore,
          },
          score: 1.0
        }));
      
      // If we found a demo node match, ONLY return demo nodes (ignore API results)
      // This prevents Elasticsearch's wrong matches from polluting results
      if (demoResults.length > 0 && query.q) {
        console.log('[lucid-l2-adapter] Demo node match found, using demo only:', demoResults.length);
        results = demoResults;
      } else {
        // Otherwise merge and deduplicate
        const merged = [...demoResults, ...results];
        const seen = new Set<string>();
        results = merged.filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        console.log('[lucid-l2-adapter] Merged results, total after dedup:', results.length);
      }
      
      
      // Cache results (5 minutes)
      try {
        await nodeCache.set(cacheKey, results, { ttl: 300 });
      } catch (_error) {
        // Silently fail cache writes - not critical
      }

      return results;
    } catch (_error: unknown) {
      // This shouldn't happen since we already caught API errors above
      // But if it does, return empty array
      return [];
    }
  }
}
