/**
 * Centralized Auth Configuration
 * 
 * All auth-related configuration in one place
 * Makes it easy to adjust timeouts, cookie settings, etc.
 */

export const AUTH_CONFIG = {
  /**
   * Session TTL - How long a session is valid
   * 1 hour (3600 seconds)
   */
  sessionTTL: 3600,
  
  /**
   * Refresh Token TTL - How long a refresh token is valid
   * 24 hours (86400 seconds)
   */
  refreshTokenTTL: 86400,
  
  /**
   * Cache TTL - How long to cache session data
   * 5 minutes (300 seconds) - Balance between performance and freshness
   */
  cacheTTL: 300,
  
  /**
   * User Profile Cache TTL
   * 5 minutes (300 seconds)
   */
  profileCacheTTL: 300,
  
  /**
   * Permissions Cache TTL
   * 1 hour (3600 seconds) - Permissions change less frequently
   */
  permissionsCacheTTL: 3600,
  
  /**
   * Cookie configuration
   */
  cookies: {
    /**
     * Auth token cookie name
     */
    authToken: 'privy-token',
    
    /**
     * Refresh token cookie name
     */
    refreshToken: 'privy-refresh-token',
    
    /**
     * ID token cookie name
     */
    idToken: 'privy-id-token',
    
    /**
     * Cookie options
     */
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 86400, // 24 hours
    },
  },
  
  /**
   * Rate limiting configuration (from existing rate-limit.ts)
   */
  rateLimits: {
    auth: {
      perMinute: 5,
      perHour: 50,
    },
    api: {
      perMinute: 60,
      perHour: 1000,
    },
  },
  
  /**
   * Feature flags for auth features
   * Integrated with main feature flags system
   */
  features: {
    walletLogin: true,
    emailLogin: true,
    googleLogin: true,
    sessionCaching: true,
    serverActions: true,
  },
} as const;

/**
 * Get auth configuration
 * Allows for runtime overrides in the future
 */
export function getAuthConfig() {
  return AUTH_CONFIG;
}

/**
 * Type-safe auth config
 */
export type AuthConfig = typeof AUTH_CONFIG;
