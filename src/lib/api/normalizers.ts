/**
 * API Response Normalizers
 * 
 * Industry Standard: Centralized API response normalization
 * Used by: Netflix, Spotify, Airbnb, Uber
 * 
 * Benefits:
 * - Single source of truth for field mappings
 * - Consistent across ALL APIs
 * - Easy to maintain
 * - Reusable everywhere
 * 
 * Pattern:
 * Raw API Response → Normalizer → Standardized Format
 */

/**
 * Icon variants for light/dark mode support
 */
export interface IconVariants {
  light: string | undefined;
  dark: string | undefined;
}

/**
 * Process icon URL (proxy relative paths through API)
 */
function processIconPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  
  // QUICK TEST: Set to true to bypass Next.js proxy and use API directly
  const BYPASS_PROXY = false; // ← Now disabled to test proxy with logging
  
  // If it's a relative path from n8n (nodes-base/... or icons/...)
  if (path.startsWith('nodes-base') || path.startsWith('/nodes-base') || 
      path.startsWith('icons/') || path.startsWith('/icons/')) {
    const cleanPath = path.replace(/^\//, '');
    
    // Bypass mode: Use API directly
    if (BYPASS_PROXY && typeof window !== 'undefined') {
      const url = `https://api.lucid.foundation/api/flow/icon/${cleanPath}`;
      console.log('[DEBUG] Using direct API:', url);
      return url;
    }
    
    // Normal mode: Proxy through Next.js
    return `/api/lucid-l2/icons/${cleanPath}`;
  }
  
  // Absolute URLs - return as-is (external logos)
  return path;
}

/**
 * Generate dark icon variant by converting .svg → .dark.svg
 * n8n convention: notion.svg → notion.dark.svg
 */
function generateDarkIconPath(lightPath: string | undefined): string | undefined {
  if (!lightPath) return undefined;
  
  // Only for n8n icons (paths already proxied)
  if (!lightPath.includes('/api/lucid-l2/icons/')) return lightPath;
  
  // Don't generate if already a .dark.svg
  if (lightPath.endsWith('.dark.svg')) return lightPath;
  
  // Convert: /api/lucid-l2/icons/.../notion.svg → /api/lucid-l2/icons/.../notion.dark.svg
  return lightPath.replace(/\.svg$/, '.dark.svg');
}

/**
 * Normalize icon URLs with dark/light mode support
 * 
 * Different APIs return logos in different fields:
 * - Lucid L2 (n8n): iconUrl object with { light: string, dark?: string } OR just a string
 * - AI Aggregator: logo_url or avatar_url (absolute URLs)
 * - Supabase: icon_url or logo_url (absolute URLs)
 * 
 * n8n format (when object):
 * - icon.light: Primary (usually colorful) logo SVG
 * - icon.dark: White/inverted version for dark themes
 * 
 * n8n format (when string):
 * - Just "nodes-base/.../notion.svg"
 * - We auto-generate dark variant as "nodes-base/.../notion.dark.svg"
 * 
 * @returns Object with light and dark icon variants
 */
export function normalizeIconVariants(data: Record<string, unknown>): IconVariants {
  // Debug log for Notion specifically
  const metadata = data.metadata as Record<string, unknown> | undefined;

  // Try all possible field names (in order of preference)
  // IMPORTANT: Check metadata first as n8n stores icon objects there
  const possibleUrls: unknown[] = [
    metadata?.icon_url,  // n8n stores here as {light, dark} object
    metadata?.iconUrl,
    data.icon_url,
    data.iconUrl,
    data.logo_url,
    data.logoUrl,
    data.avatar_url,
    data.avatarUrl,
    data.image_url,
    data.imageUrl,
    data.thumbnail_url,
    data.thumbnailUrl,
    metadata?.logo_url,
    metadata?.logoUrl,
  ];

  for (const url of possibleUrls) {
    if (!url) continue;

    // Handle string URLs (DO NOT auto-generate dark variant)
    // Only use dark when explicitly provided by n8n
    if (typeof url === 'string') {
      const processed = processIconPath(url);

      return {
        light: processed,
        dark: undefined, // Don't auto-generate - file might not exist!
      };
    }

    // Handle n8n format: { light: "...", dark: "..." } or { icon: "...", dark: "..." }
    if (typeof url === 'object' && url !== null) {
      const urlObj = url as Record<string, unknown>;
      const lightUrl = (urlObj.light || urlObj.icon || urlObj.default) as string | undefined;
      const darkUrl = urlObj.dark as string | undefined;

      return {
        light: processIconPath(lightUrl),
        dark: processIconPath(darkUrl) || generateDarkIconPath(processIconPath(lightUrl)),
      };
    }
  }

  return {
    light: undefined,
    dark: undefined,
  };
}

/**
 * Normalize icon/logo URL from various API formats (LEGACY)
 * 
 * @deprecated Use normalizeIconVariants() for dark/light mode support
 * 
 * This returns only the light variant for backwards compatibility
 */
export function normalizeIconUrl(data: Record<string, unknown>): string | undefined {
  const variants = normalizeIconVariants(data);
  return variants.light;
}

/**
 * Normalize description from various API formats
 */
export function normalizeDescription(data: Record<string, unknown>): string | undefined {
  const metadata = data.metadata as Record<string, unknown> | undefined;
  return (
    (data.description as string) ||
    (data.desc as string) ||
    (data.summary as string) ||
    (data.about as string) ||
    (metadata?.description as string) ||
    undefined
  );
}

/**
 * Normalize tags/categories from various API formats
 */
export function normalizeTags(data: Record<string, unknown>): string[] {
  const metadata = data.metadata as Record<string, unknown> | undefined;
  // Handle array of strings
  if (Array.isArray(data.tags)) return data.tags as string[];
  if (Array.isArray(data.categories)) return data.categories as string[];
  if (Array.isArray(data.labels)) return data.labels as string[];

  // Handle comma-separated string
  if (typeof data.tags === 'string') return data.tags.split(',').map((t: string) => t.trim());
  if (typeof data.categories === 'string') return data.categories.split(',').map((t: string) => t.trim());

  // Check metadata
  if (Array.isArray(metadata?.tags)) return metadata.tags as string[];
  if (Array.isArray(metadata?.categories)) return metadata.categories as string[];

  return [];
}

/**
 * Normalize provider/author name from various API formats
 */
export function normalizeProvider(data: Record<string, unknown>): string | undefined {
  const metadata = data.metadata as Record<string, unknown> | undefined;
  return (
    (data.provider as string) ||
    (data.author as string) ||
    (data.creator as string) ||
    (data.organization as string) ||
    (data.org as string) ||
    (data.owner as string) ||
    (metadata?.provider as string) ||
    undefined
  );
}

/**
 * Normalize full resource (complete normalization)
 * 
 * Use this for complete resource normalization
 */
export interface NormalizedResource {
  id: string;
  name: string;
  description?: string;
  icon_url?: string;
  logo_url?: string;
  provider?: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

export function normalizeResource(data: Record<string, unknown>): NormalizedResource {
  const icon_url = normalizeIconUrl(data);
  
  return {
    id: (data.id || data.external_id || data.name) as string,
    name: (data.name || data.displayName || data.title || data.id) as string,
    description: normalizeDescription(data),
    icon_url,
    logo_url: icon_url, // Alias
    provider: normalizeProvider(data),
    tags: normalizeTags(data),
    metadata: (data.metadata || data) as Record<string, unknown>,
  };
}

/**
 * Type guard to check if resource has icon
 */
export function hasIcon(data: Record<string, unknown>): boolean {
  return !!normalizeIconUrl(data);
}

/**
 * Get icon URL with fallback
 */
export function getIconUrlOrFallback(
  data: Record<string, unknown>,
  fallback?: string
): string | undefined {
  return normalizeIconUrl(data) || fallback;
}
