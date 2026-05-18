/**
 * AI Aggregator Search Adapter
 * 
 * Searches across models, datasets, agents, apps, and compute
 * from the external AI Aggregator API.
 * Uses centralized API normalizers for field mapping
 */

import type { SearchAdapter, SearchQuery, SearchResult, ResourceType } from './base';
import { normalizeIconUrl, normalizeDescription, normalizeTags, normalizeProvider } from '@/lib/api/normalizers';

const AI_API_BASE = process.env.AI_AGGREGATOR_API_BASE || 
  process.env.NEXT_PUBLIC_AI_AGGREGATOR_API_BASE ||
  'http://ec2-54-204-114-86.compute-1.amazonaws.com:8001';

export class AIAggregatorAdapter implements SearchAdapter {
  name = 'ai-aggregator';
  priority = 100; // Base priority for external data
  
  private baseURL: string;
  private timeout: number;
  
  constructor(baseURL: string = AI_API_BASE, timeout: number = 30000) {
    this.baseURL = baseURL;
    this.timeout = timeout;
  }
  
  async search(query: SearchQuery): Promise<SearchResult[]> {
    console.log('[ai-aggregator] Search called:', {
      query: query.q,
      types: query.types,
      limit: query.limit,
      baseURL: this.baseURL
    });
    
    try {
      // Try /search endpoint first
      const searchUrl = new URL('/search', this.baseURL);
      searchUrl.searchParams.set('q', query.q);
      if (query.limit) searchUrl.searchParams.set('limit', query.limit.toString());
      if (query.offset) searchUrl.searchParams.set('offset', query.offset.toString());
      
      console.log('[ai-aggregator] Fetching:', searchUrl.toString());
      
      const response = await fetch(searchUrl.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.timeout),
      });
      
      console.log('[ai-aggregator] Response status:', response.status, response.ok);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[ai-aggregator] Response data:', {
          hasResults: !!data.results,
          resultsCount: data.results?.length || 0,
          firstResult: data.results?.[0] ? {
            id: data.results[0].id,
            name: data.results[0].name,
            type: data.results[0].type
          } : null
        });
        
        // If /search returns results, use them
        if (data.results && data.results.length > 0) {
          // Extract the "resource" from each result (API returns {resource: {...}, score: ...})
          const results = data.results.map((item: Record<string, unknown>) => {
            const resource = (item.resource as Record<string, unknown>) || item; // Fallback to item if no resource wrapper
            const score = (item.score as number) || (resource.score as number) || 0;
            return this.transformResult({ ...resource, score });
          });
          
          if (query.types && query.types.length > 0) {
            const filtered = results.filter((r: SearchResult) => query.types!.includes(r.type));
            console.log('[ai-aggregator] Filtered by type:', {
              before: results.length,
              after: filtered.length,
              types: query.types
            });
            return filtered;
          }
          
          return results;
        }
      }
      
      // Fallback: /search returned 0 results, use /models
      return await this.searchModels(query);
      
    } catch (error) {
      // Silently fail - external API unreliable
      console.warn(`[${this.name}] API unavailable, skipping:`, error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }
  
  /**
   * Fallback: Use /models endpoint with proper API pagination
   */
  private async searchModels(query: SearchQuery): Promise<SearchResult[]> {
    try {
      // Use API's native pagination - pass limit and offset directly
      const url = new URL('/models', this.baseURL);
      const limit = query.limit || 24;
      const offset = query.offset || 0;
      
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('offset', offset.toString());
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.timeout),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // API returns direct array
      const resultsArray = Array.isArray(data) ? data : (data.results || []);
      const results = resultsArray.map((item: Record<string, unknown>) => this.transformResult(item));
      
      // If there's a search query, filter client-side
      // (since /models doesn't support search, only pagination)
      if (query.q && query.q.trim()) {
        const searchLower = query.q.toLowerCase();
        return results.filter((r: SearchResult) =>
          r.name.toLowerCase().includes(searchLower) ||
          r.description?.toLowerCase().includes(searchLower) ||
          r.provider?.toLowerCase().includes(searchLower)
        );
      }
      
      // No search query - return paginated results directly from API
      return results;
    } catch (error) {
      // Silently fail - external API unreliable
      console.warn(`[${this.name}] /models endpoint failed:`, error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }
  
  private transformResult(item: Record<string, unknown>): SearchResult {
    // DEBUG: Log raw item to see what fields exist
    console.log('[ai-aggregator] transformResult raw item:', {
      name: item.name as string,
      avatar_url: item.avatar_url as string,
      icon_url: item.icon_url as string,
      logo_url: item.logo_url as string,
      allKeys: Object.keys(item).slice(0, 20) // First 20 keys
    });
    
    // Use centralized normalizers for ALL fields
    const icon_url = normalizeIconUrl(item);
    const description = normalizeDescription(item);
    const provider = normalizeProvider(item);
    const tags = normalizeTags(item);
    
    // Get avatar_url directly from item (HuggingFace organization logo)
    const avatar_url = item.avatar_url as string | undefined;
    
    console.log('[ai-aggregator] After normalization:', {
      name: item.name as string,
      icon_url,
      avatar_url,
      final: icon_url || avatar_url
    });
    
    return {
      id: item.id as string,
      external_id: item.id as string,
      type: ((item.type as string) || 'MODEL').toUpperCase() as ResourceType,
      source: this.name,
      name: (item.name as string) || (item.displayName as string) || (item.title as string) || 'Unknown',
      description,
      provider,
      // Centralized normalization - use avatar_url as fallback
      icon_url: icon_url || avatar_url,
      logo_url: icon_url || avatar_url,
      metadata: {
        ...item,
        tags, // Normalized tags
        avatar_url, // Preserve avatar_url in metadata too
      },
      score: (item.score as number) || (item.relevance_score as number) || 0
    };
  }
}
