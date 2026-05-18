/**
 * Search Orchestrator
 * 
 * Coordinates multiple search adapters and combines results.
 * Follows the Orchestrator pattern for composable, multi-source search.
 */

import type { SearchAdapter, SearchQuery, SearchResult } from './adapters/base';

export class SearchOrchestrator {
  private adapters: SearchAdapter[] = [];

  constructor(adapters: SearchAdapter[]) {
    // Sort by priority (higher first)
    this.adapters = adapters.sort((a, b) => b.priority - a.priority);
    
    if (process.env.NODE_ENV === 'development' || process.env.SEARCH_TIMING_LOGS === 'true') {
      console.log('[SearchOrchestrator] Initialized with adapters:', {
        adapters: this.adapters.map(a => ({
          name: a.name,
          priority: a.priority
        }))
      });
    }
  }

  /**
   * Search across all adapters in parallel
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const startTime = performance.now();
    
    if (process.env.NODE_ENV === 'development' || process.env.SEARCH_TIMING_LOGS === 'true') {
      console.log('[SearchOrchestrator] Starting search:', {
        query: query.q,
        types: query.types,
        limit: query.limit,
        sources: this.adapters.map(a => a.name)
      });
    }

    // Execute all searches in parallel
    const results = await Promise.allSettled(
      this.adapters.map(adapter => 
        adapter.search(query).catch(error => {
          console.error(`[SearchOrchestrator] ${adapter.name} failed:`, error);
          return []; // Return empty on error (graceful degradation)
        })
      )
    );

    // Collect all successful results
    const allResults = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => (r as PromiseFulfilledResult<SearchResult[]>).value);

    // Deduplicate by ID
    const uniqueResults = this.deduplicateResults(allResults);

    // Sort by priority and relevance
    const sortedResults = this.sortResults(uniqueResults);
    
    const duration = performance.now() - startTime;
    
    if (process.env.NODE_ENV === 'development' || process.env.SEARCH_TIMING_LOGS === 'true') {
      console.log('[SearchOrchestrator] Search complete:', {
        duration_ms: duration.toFixed(0),
        total_results: sortedResults.length,
        sources: this.getResultSources(sortedResults)
      });
    }

    return sortedResults;
  }

  /**
   * Remove duplicate results (same ID from different sources)
   * Priority: Higher priority adapter wins
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Map<string, SearchResult>();
    
    // Sort by source priority first
    const sortedByPriority = results.sort((a, b) => {
      const aPriority = this.adapters.find(ad => ad.name === a.source)?.priority || 0;
      const bPriority = this.adapters.find(ad => ad.name === b.source)?.priority || 0;
      return bPriority - aPriority;
    });
    
    // Keep only first occurrence (highest priority)
    for (const result of sortedByPriority) {
      const key = `${result.type}:${result.id}`;
      if (!seen.has(key)) {
        seen.set(key, result);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Sort results by:
   * 1. Source priority (user's data > external data)
   * 2. Relevance score
   * 3. Name (alphabetical)
   */
  private sortResults(results: SearchResult[]): SearchResult[] {
    return results.sort((a, b) => {
      // 1. Compare source priority
      const aPriority = this.adapters.find(ad => ad.name === a.source)?.priority || 0;
      const bPriority = this.adapters.find(ad => ad.name === b.source)?.priority || 0;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // 2. Compare relevance score
      const aScore = a.score || 0;
      const bScore = b.score || 0;
      
      if (aScore !== bScore) {
        return bScore - aScore;
      }
      
      // 3. Alphabetical by name
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get result distribution by source
   */
  private getResultSources(results: SearchResult[]): Record<string, number> {
    return results.reduce((acc, r) => {
      acc[r.source] = (acc[r.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Add a new adapter dynamically
   */
  addAdapter(adapter: SearchAdapter): void {
    this.adapters.push(adapter);
    this.adapters.sort((a, b) => b.priority - a.priority);
    
    console.log('[SearchOrchestrator] Added adapter:', {
      name: adapter.name,
      priority: adapter.priority
    });
  }

  /**
   * Remove an adapter
   */
  removeAdapter(name: string): boolean {
    const index = this.adapters.findIndex(a => a.name === name);
    if (index !== -1) {
      this.adapters.splice(index, 1);
      console.log('[SearchOrchestrator] Removed adapter:', name);
      return true;
    }
    return false;
  }

  /**
   * Get list of active adapters
   */
  getAdapters(): SearchAdapter[] {
    return [...this.adapters];
  }
}
