/**
 * OAuth Utilities
 * 
 * Centralized helper functions for OAuth operations.
 * Industry standard: Keep URL construction and transformations in one place.
 * 
 * @example
 * import { getNangoLogoUrl, getProviderDisplayName } from '@/lib/oauth/utils'
 * 
 * const logoUrl = getNangoLogoUrl('twitter')
 * // → https://api.lucid.foundation/nango/images/template-logos/twitter.svg
 */

// Base URL for Nango template logos
const NANGO_LOGO_BASE_URL = 'https://api.lucid.foundation/nango/images/template-logos'

/**
 * Custom local logos for rebranded services
 * Maps provider IDs to local logo paths in /public/logos/
 * Use when Nango doesn't have the updated logo (e.g., Twitter → X)
 */
const CUSTOM_LOGO_OVERRIDES: Record<string, string> = {
  // X (formerly Twitter) - use X logo
  'twitter': '/logos/x.png',

  // Add more custom overrides as services rebrand
  // 'facebook': '/logos/meta.svg',
}

/**
 * Provider logo aliases for Nango logos only
 * Maps provider IDs to their Nango logo filename (without extension)
 * Use when provider ID differs from Nango's filename
 */
const NANGO_LOGO_ALIASES: Record<string, string> = {
  // Add aliases if provider ID differs from Nango's filename
  // 'custom-slack': 'slack',
}

/**
 * Get the logo URL for a provider
 * 
 * Priority:
 * 1. Custom local override (for rebranded services like Twitter → X)
 * 2. Nango alias (if provider ID differs from Nango's filename)
 * 3. Default Nango URL
 * 
 * @param providerId - The provider ID (e.g., 'twitter', 'github', 'google')
 * @returns The URL to the provider's logo
 * 
 * @example
 * getNangoLogoUrl('twitter')
 * // → /logos/x.png (custom override for rebranding)
 * 
 * getNangoLogoUrl('google-mail')
 * // → https://api.lucid.foundation/nango/images/template-logos/google-mail.svg
 */
export function getNangoLogoUrl(providerId: string): string {
  // Normalize provider ID (lowercase, trim whitespace)
  const normalizedId = providerId.toLowerCase().trim()
  
  // Priority 1: Check for custom local override (rebranded services)
  if (CUSTOM_LOGO_OVERRIDES[normalizedId]) {
    return CUSTOM_LOGO_OVERRIDES[normalizedId]
  }
  
  // Priority 2: Check for Nango alias (if filename differs from provider ID)
  const logoId = NANGO_LOGO_ALIASES[normalizedId] || normalizedId
  
  // Priority 3: Default Nango URL
  return `${NANGO_LOGO_BASE_URL}/${logoId}.svg`
}

/**
 * Get provider display name from ID
 * 
 * Transforms provider IDs like 'google-mail' into 'Google Mail'
 * 
 * @param providerId - The provider ID
 * @returns Formatted display name
 * 
 * @example
 * getProviderDisplayName('google-mail') // → 'Google Mail'
 * getProviderDisplayName('twitter')     // → 'Twitter'
 * getProviderDisplayName('github')      // → 'Github'
 */
export function getProviderDisplayName(providerId: string): string {
  return providerId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Check if a provider logo URL is valid (basic validation)
 * 
 * @param providerId - The provider ID to validate
 * @returns True if the provider ID looks valid
 */
export function isValidProviderId(providerId: string): boolean {
  // Provider IDs should be lowercase alphanumeric with optional hyphens
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(providerId.toLowerCase())
}

/**
 * Get provider logo with fallback
 * 
 * Returns the Nango logo URL if provider ID is valid,
 * otherwise returns a fallback placeholder URL.
 * 
 * @param providerId - The provider ID
 * @param fallbackUrl - Optional fallback URL (defaults to a generic icon)
 * @returns Logo URL or fallback
 */
export function getProviderLogoUrl(
  providerId: string | undefined,
  fallbackUrl = '/icons/integration-default.svg'
): string {
  if (!providerId || !isValidProviderId(providerId)) {
    return fallbackUrl
  }
  
  return getNangoLogoUrl(providerId)
}

/**
 * Common OAuth provider categories
 * Used for filtering and grouping in UI
 */
export const OAUTH_CATEGORIES = {
  SOCIAL: 'social',
  PRODUCTIVITY: 'productivity',
  DEVELOPER: 'developer',
  COMMUNICATION: 'communication',
  MARKETING: 'marketing',
  FINANCE: 'finance',
  CRM: 'crm',
  STORAGE: 'storage',
  OTHER: 'other',
} as const

export type OAuthCategory = typeof OAUTH_CATEGORIES[keyof typeof OAUTH_CATEGORIES]

/**
 * Map provider IDs to their categories
 * Useful for filtering UI
 */
export const PROVIDER_CATEGORIES: Record<string, OAuthCategory> = {
  // Social
  twitter: 'social',
  facebook: 'social',
  linkedin: 'social',
  instagram: 'social',
  tiktok: 'social',
  
  // Productivity
  'google-calendar': 'productivity',
  'google-sheets': 'productivity',
  notion: 'productivity',
  airtable: 'productivity',
  asana: 'productivity',
  monday: 'productivity',
  
  // Developer
  github: 'developer',
  gitlab: 'developer',
  bitbucket: 'developer',
  vercel: 'developer',
  netlify: 'developer',
  
  // Communication
  slack: 'communication',
  discord: 'communication',
  teams: 'communication',
  zoom: 'communication',
  'google-mail': 'communication',
  
  // Marketing
  mailchimp: 'marketing',
  hubspot: 'marketing',
  sendgrid: 'marketing',
  
  // Finance
  stripe: 'finance',
  quickbooks: 'finance',
  xero: 'finance',
  
  // CRM
  salesforce: 'crm',
  pipedrive: 'crm',
  
  // Storage
  dropbox: 'storage',
  'google-drive': 'storage',
  onedrive: 'storage',
  box: 'storage',
}

/**
 * Get the category for a provider
 * 
 * @param providerId - The provider ID
 * @returns The category or 'other' as fallback
 */
export function getProviderCategory(providerId: string): OAuthCategory {
  return PROVIDER_CATEGORIES[providerId.toLowerCase()] || 'other'
}
