/**
 * AI Aggregator Client
 * 
 * Type-safe client for the AI Aggregator API with centralized caching
 * Uses CacheService from src/lib/cache/ for consistency
 */

import { nodeCache } from '@/lib/cache/service';

const AI_API_BASE = process.env.AI_AGGREGATOR_API_BASE || 
  process.env.NEXT_PUBLIC_AI_AGGREGATOR_API_BASE ||
  'http://ec2-98-89-47-179.compute-1.amazonaws.com:8001';

export interface SearchParams {
  q?: string;
  kind?: 'MODEL' | 'DATASET' | 'AGENT' | 'COMPUTE' | 'APP';
  limit?: number;
  offset?: number;
}

export interface AIResource {
  id: string;
  name: string;
  kind: string;
  provider?: string;
  description?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface SearchResponse {
  results: AIResource[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * AI Aggregator API Client
 * Handles all communication with the external AI catalog API
 */
export class AIAggregatorClient {
  private baseURL: string;
  private timeout: number;
  
  constructor(baseURL: string = AI_API_BASE, timeout: number = 5000) {
    this.baseURL = baseURL;
    this.timeout = timeout;
  }
  
  /**
   * Search all resources with caching
   * Cache TTL: 60 seconds
   */
  async search(params: SearchParams): Promise<SearchResponse> {
    const cacheKey = `ai:search:${JSON.stringify(params)}`;
    
    console.log('[ai-aggregator] Search called:', {
      params,
      baseURL: this.baseURL,
      cacheKey
    });
    
    // Try cache first
    try {
      const cached = await nodeCache.get<SearchResponse>(cacheKey);
      if (cached) {
        console.log('[ai-aggregator] Cache HIT');
        return cached;
      }
      console.log('[ai-aggregator] Cache MISS');
    } catch (error) {
      console.warn('[ai-aggregator] Cache read failed:', error);
    }
    
    // The /search endpoint returns 200 but with 0 results
    // So we skip it and go directly to /models with client-side filtering
    console.log('[ai-aggregator] Using /models endpoint with client-side filtering');
    
    const result = await this.searchByKind(params);
    
    // Cache result (60 seconds)
    try {
      await nodeCache.set(cacheKey, result, { ttl: 60 });
    } catch (error) {
      console.warn('[ai-aggregator] Cache write failed:', error);
    }
    
    return result;
  }
  
  /**
   * Search by kind using specific endpoints (/models, /datasets, etc.)
   */
  private async searchByKind(params: SearchParams): Promise<SearchResponse> {
    console.log('[ai-aggregator] searchByKind called:', params);
    
    switch (params.kind) {
      case 'MODEL':
        return await this.getModels({ limit: params.limit, offset: params.offset });
      case 'DATASET':
        return await this.getDatasets({ limit: params.limit, offset: params.offset });
      case 'AGENT':
        return await this.getAgents({ limit: params.limit, offset: params.offset });
      default:
        // If no kind, try fetching models as default
        console.log('[ai-aggregator] No kind specified, defaulting to models');
        const models = await this.getModels({ limit: params.limit, offset: params.offset });
        
        // Filter by search query if provided
        if (params.q) {
          const filtered = models.results.filter(item =>
            item.name.toLowerCase().includes(params.q!.toLowerCase()) ||
            item.description?.toLowerCase().includes(params.q!.toLowerCase())
          );
          return {
            ...models,
            results: filtered,
            total: filtered.length
          };
        }
        
        return models;
    }
  }
  
  /**
   * Get models
   * Cache TTL: 5 minutes
   */
  async getModels(params?: {
    provider?: string;
    limit?: number;
    offset?: number;
  }): Promise<SearchResponse> {
    const cacheKey = `ai:models:${JSON.stringify(params || {})}`;
    
    // Try cache first
    try {
      const cached = await nodeCache.get<SearchResponse>(cacheKey);
      if (cached) return cached;
    } catch (error) {
      console.warn('[ai-client] Cache read failed:', error);
    }
    
    const url = new URL('/models', this.baseURL);
    if (params?.provider) url.searchParams.set('provider', params.provider);
    if (params?.limit) url.searchParams.set('limit', params.limit.toString());
    if (params?.offset) url.searchParams.set('offset', params.offset.toString());
    
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(this.timeout),
    });
    
    if (!response.ok) {
      console.error('[ai-aggregator] /models endpoint failed: HTTP', response.status);
      // Return empty results instead of throwing
      return { results: [], total: 0, offset: params?.offset || 0, limit: params?.limit || 24 };
    }
    
    const data = await response.json();
    
    // Cache result (5 minutes)
    try {
      await nodeCache.set(cacheKey, data, { ttl: 300 });
    } catch (error) {
      console.warn('[ai-client] Cache write failed:', error);
    }
    
    return data;
  }
  
  /**
   * Get datasets
   * Cache TTL: 5 minutes
   */
  async getDatasets(params?: {
    limit?: number;
    offset?: number;
  }): Promise<SearchResponse> {
    const cacheKey = `ai:datasets:${JSON.stringify(params || {})}`;
    
    // Try cache first
    try {
      const cached = await nodeCache.get<SearchResponse>(cacheKey);
      if (cached) return cached;
    } catch (error) {
      console.warn('[ai-client] Cache read failed:', error);
    }
    
    const url = new URL('/datasets', this.baseURL);
    if (params?.limit) url.searchParams.set('limit', params.limit.toString());
    if (params?.offset) url.searchParams.set('offset', params.offset.toString());
    
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(this.timeout),
    });
    
    const data = await response.json();
    
    // Cache result (5 minutes)
    try {
      await nodeCache.set(cacheKey, data, { ttl: 300 });
    } catch (error) {
      console.warn('[ai-client] Cache write failed:', error);
    }
    
    return data;
  }
  
  /**
   * Get agents
   * Cache TTL: 5 minutes
   */
  async getAgents(params?: {
    limit?: number;
    offset?: number;
  }): Promise<SearchResponse> {
    const cacheKey = `ai:agents:${JSON.stringify(params || {})}`;
    
    // Try cache first
    try {
      const cached = await nodeCache.get<SearchResponse>(cacheKey);
      if (cached) return cached;
    } catch (error) {
      console.warn('[ai-client] Cache read failed:', error);
    }
    
    const url = new URL('/agents', this.baseURL);
    if (params?.limit) url.searchParams.set('limit', params.limit.toString());
    if (params?.offset) url.searchParams.set('offset', params.offset.toString());
    
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(this.timeout),
    });
    
    const data = await response.json();
    
    // Cache result (5 minutes)
    try {
      await nodeCache.set(cacheKey, data, { ttl: 300 });
    } catch (error) {
      console.warn('[ai-client] Cache write failed:', error);
    }
    
    return data;
  }
  
  /**
   * Invoke a model
   * NO caching for invocations!
   */
  async invokeModel(modelId: string, request: Record<string, unknown>): Promise<unknown> {
    const url = new URL(`/invoke/model/${modelId}`, this.baseURL);
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30000), // 30s timeout for model execution
    });
    
    if (!response.ok) {
      throw new Error(`Model invocation failed: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * Get providers list
   * Cache TTL: 1 hour (rarely changes)
   */
  async getProviders(): Promise<unknown> {
    const cacheKey = 'ai:providers';

    // Try cache first
    try {
      const cached = await nodeCache.get<unknown>(cacheKey);
      if (cached) return cached;
    } catch (error) {
      console.warn('[ai-client] Cache read failed:', error);
    }
    
    const url = new URL('/providers', this.baseURL);
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(this.timeout),
    });
    
    const data = await response.json();
    
    // Cache result (1 hour)
    try {
      await nodeCache.set(cacheKey, data, { ttl: 3600 });
    } catch (error) {
      console.warn('[ai-client] Cache write failed:', error);
    }
    
    return data;
  }
}

// Singleton instance
export const aiAggregator = new AIAggregatorClient();
