/**
 * Workspace Search Adapter
 * 
 * Searches user's workspace data (agents, apps, favorites)
 * Higher priority than external data (user's data comes first)
 */

import type { SearchAdapter, SearchQuery, SearchResult } from './base';
import { maskIdentifier } from '@/lib/logging/safe-log';

export class WorkspaceAdapter implements SearchAdapter {
  name = 'workspace';
  priority = 200; // Higher than external data (100)
  
  async search(query: SearchQuery): Promise<SearchResult[]> {
    console.log('[workspace-adapter] Search called:', {
      query: query.q,
      types: query.types,
      userId: maskIdentifier(query.userId),
      limit: query.limit
    });
    
    if (!query.userId) {
      console.log('[workspace-adapter] No auth subject provided, skipping');
      return [];
    }
    
    try {
      // Build API request
      const params = new URLSearchParams({
        q: query.q,
        userId: query.userId,
      });
      
      if (query.limit) params.set('limit', query.limit.toString());
      if (query.offset) params.set('offset', query.offset.toString());
      if (query.types?.length) params.set('types', query.types.join(','));
      
      // Call workspace search API
      const response = await fetch(`/api/workspace/search?${params}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        console.warn('[workspace-adapter] API error:', response.status);
        return [];
      }
      
      const data = await response.json();
      const results = data.results || [];
      
      console.log('[workspace-adapter] Found results:', {
        count: results.length,
        types: [...new Set(results.map((r: Record<string, unknown>) => r.type))]
      });
      
      // Transform to SearchResult format
      return results.map((item: Record<string, unknown>) => ({
        id: item.id,
        external_id: item.id,
        type: item.type,
        source: this.name,
        name: item.name || item.title,
        description: item.description,
        provider: 'Your Workspace',
        icon_url: item.icon_url || item.logo_url,
        logo_url: item.icon_url || item.logo_url,
        metadata: {
          ...item,
          isUserData: true, // Flag for special handling
        },
        score: item.score || 1.0,
        userMeta: {
          bookmarked: item.bookmarked,
          liked: item.liked,
          rating: item.rating,
        }
      }));
    } catch (error) {
      console.error('[workspace-adapter] Search failed:', error);
      return []; // Graceful degradation
    }
  }
}
