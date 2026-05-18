/**
 * Lucid-L2 Configuration
 * 
 * Centralized configuration for Lucid-L2 integration.
 * All external requests are proxied through Next.js API routes for security and caching.
 * 
 * Architecture:
 * - Client -> Next.js API routes -> Lucid-L2 server
 * - All external URLs hidden from client
 * - Server-side caching, auth, and monitoring
 * 
 * @example
 * ```typescript
 * import { LUCID_L2_CONFIG, getLucidL2IconUrl } from '@/lib/lucid-l2/config';
 * 
 * const iconUrl = getLucidL2IconUrl('icons/n8n-nodes-base/dist/nodes/Slack/slack.svg');
 * // Returns: /api/lucid-l2/icons/icons/n8n-nodes-base/dist/nodes/Slack/slack.svg
 * ```
 */

/**
 * Lucid-L2 configuration constants
 * All URLs point to internal Next.js API routes (not external services)
 */
export const LUCID_L2_CONFIG = {
  /** Internal API route for node data */
  NODES_API: '/api/lucid-l2/nodes',
  
  /** Internal API route for icon proxy */
  ICONS_API: '/api/lucid-l2/icons',
} as const;

/**
 * Get the full URL for a Lucid-L2 node icon
 * 
 * Handles two types of icon paths:
 * 1. Local public assets (start with /): Return as-is (e.g., /logos/icon/hyperliquid.png)
 * 2. n8n API icons: Proxy through API route (e.g., icons/n8n-nodes-base/dist/nodes/Slack/slack.svg)
 * 
 * @param iconPath - Icon path from node.iconUrl
 * @returns Icon URL (either local path or API proxy URL)
 * 
 * @example
 * ```typescript
 * // Local public asset
 * getLucidL2IconUrl('/logos/icon/hyperliquid.png')
 * // Returns: /logos/icon/hyperliquid.png
 * 
 * // n8n API icon
 * getLucidL2IconUrl('icons/n8n-nodes-base/dist/nodes/Slack/slack.svg')
 * // Returns: /api/lucid-l2/icons/icons/n8n-nodes-base/dist/nodes/Slack/slack.svg
 * ```
 */
export function getLucidL2IconUrl(iconPath: string): string {
  // If path starts with /, it's a local public asset - return as-is
  if (iconPath.startsWith('/')) {
    return iconPath;
  }
  
  // Otherwise, it's an n8n API icon - proxy through our API route
  return `${LUCID_L2_CONFIG.ICONS_API}/${iconPath}`;
}

/**
 * Type helper for Lucid-L2 configuration
 */
export type LucidL2Config = typeof LUCID_L2_CONFIG;
