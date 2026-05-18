/**
 * Maintenance Mode Configuration
 * 
 * Simple toggle to redirect all traffic to countdown page
 * Secure bypass mechanism for authorized users
 */

/**
 * Check if maintenance mode is enabled
 */
export function isMaintenanceModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true'
}

/**
 * Check if a bypass token is valid
 * Use a strong secret token to bypass maintenance mode
 */
export function isValidBypassToken(token: string | null): boolean {
  if (!token) return false
  
  const bypassToken = process.env.MAINTENANCE_BYPASS_TOKEN
  
  // Must have bypass token configured and it must match
  return !!(bypassToken && token === bypassToken)
}

/**
 * Routes that are always accessible (even in maintenance mode)
 */
export const ALWAYS_ACCESSIBLE_ROUTES = [
  '/countdown',
  '/test', // Test pages (e.g., auth testing)
  '/_next',
  '/api/health', // Health check endpoint
  '/favicon.ico',
  '/videos',
  '/images',
  '/public',
]

/**
 * Check if a path should be accessible during maintenance
 */
export function isPathAccessible(pathname: string): boolean {
  // Check if path matches any always accessible route
  return ALWAYS_ACCESSIBLE_ROUTES.some(route => 
    pathname.startsWith(route)
  )
}
