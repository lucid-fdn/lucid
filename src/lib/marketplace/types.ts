/**
 * Marketplace types for ES + Supabase overlay pattern
 */

export type AssetKind = 'MODEL' | 'DATASET' | 'AGENT' | 'COMPUTE';

export type ApiAsset = {
  external_id: string;
  slug: string;
  kind: AssetKind;
  name: string;
  version: string;
  summary?: string;
  description?: string;
  tags?: string[];
  license?: string;
  p95_ms?: number;
  cost_per_tok?: number;
  eu_only?: boolean;
  cc_on?: boolean;
  owner_org_slug?: string;
  owner_user_handle?: string;
  provider?: string;
};

export type DbOverlay = {
  // Identity
  external_id?: string;
  asset_row_id?: string;

  // Aggregated stats
  rating_avg?: number;
  rating_count?: number;
  likes_count?: number;
  bookmarks_count?: number;
  comments_count?: number;
  runs_count?: number;
  runs_count_30d?: number;
  proven_runs?: number;
  reliability?: number;
  
  // Curation flags
  featured?: boolean;
  trending?: boolean;

  // User-specific data
  liked?: boolean;
  bookmarked?: boolean;
  user_rating?: number;
  user_comment?: string;
  
  // Organization data
  owner_org?: {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
    logo_url?: string;
    description?: string;
  };
  
  // Contributors
  contributors?: Array<{
    id: string;
    handle: string;
    name?: string;
    avatar_url?: string;
  }>;
  
  // Additional metadata
  created_at?: string;
  updated_at?: string;
  visibility?: 'PUBLIC' | 'PRIVATE' | 'ORG_ONLY';
};

export type UiAsset = ApiAsset & { 
  overlay?: DbOverlay
};

export type SearchFilters = {
  q?: string;
  kind?: AssetKind;
  ids?: string[]; // Specific asset IDs for curated collections (Netflix/Spotify pattern)
  tags?: string[];
  sort?: 'relevance' | 'rating' | 'recent' | 'runs';
  p95_lte?: number;
  price_lte?: number;
  eu_only?: boolean;
  cc_on?: boolean;
  owner_org_slug?: string;
  owner_user_handle?: string;
  cursor?: string;
  offset?: number; // For offset-based pagination
  limit?: number;
};

export type ApiResponse = {
  assets: ApiAsset[];
  cursor?: string;
  total?: number;
};
