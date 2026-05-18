/**
 * Search Adapter Interface
 * 
 * Defines the contract for all search adapters.
 * Follows the Adapter pattern for composable, testable search.
 */

export interface SearchAdapter {
  /** Unique identifier for this adapter */
  name: string;
  
  /** Priority for result ranking (higher = more important) */
  priority: number;
  
  /** Execute search query */
  search(query: SearchQuery): Promise<SearchResult[]>;
}

export interface SearchQuery {
  /** Search query string */
  q: string;
  
  /** Resource types to search (empty = all types) */
  types?: ResourceType[];
  
  /** Sort order (downloads, created_at, etc.) */
  sort?: string;
  
  /** Maximum results to return */
  limit?: number;
  
  /** Pagination offset */
  offset?: number;
  
  /** User ID for personalization */
  userId?: string;
}

export type ResourceType = 
  | 'MODEL' 
  | 'DATASET' 
  | 'AGENT' 
  | 'APP' 
  | 'COMPUTE'
  | 'CONNECTOR';

export interface SearchResult {
  /** Unique identifier */
  id: string;
  
  /** External ID (for API calls) */
  external_id: string;
  
  /** Resource type */
  type: ResourceType;
  
  /** Source adapter name */
  source: string;
  
  /** Display name */
  name: string;
  
  /** Description */
  description?: string;
  
  /** Provider (HuggingFace, OpenAI, etc.) */
  provider?: string;
  
  /** Icon/Logo URL (for visual display) - light theme variant */
  icon_url?: string;
  
  /** Alias for icon_url (compatibility) */
  logo_url?: string;
  
  /** Dark theme icon variant (for dark mode support) */
  icon_url_dark?: string;
  
  /** Full metadata */
  metadata: Record<string, unknown>;
  
  /** Relevance score (0-1) */
  score?: number;
  
  /** User-specific metadata */
  userMeta?: {
    bookmarked?: boolean;
    liked?: boolean;
    rating?: number;
  };
}
