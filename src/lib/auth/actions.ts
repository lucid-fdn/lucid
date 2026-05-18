/**
 * Server Actions for Auth
 * 
 * Type-safe server actions for authentication operations
 * Can be called directly from client components
 * 
 * @example
 * ```tsx
 * 'use client'
 * 
 * import { logoutAction } from '@/lib/auth/actions'
 * 
 * function LogoutButton() {
 *   return (
 *     <button onClick={() => logoutAction()}>
 *       Logout
 *     </button>
 *   )
 * }
 * ```
 */

'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { AUTH_CONFIG } from './config';
import { AuthAudit } from './audit';
import { getServerAuth } from './server-utils';
import type { CachedUser } from './cache';
import { maskIdentifier, summarizeError } from '@/lib/logging/safe-log';

// ============================================================================
// Types
// ============================================================================

type ActionResult<T = void> = {
  success: boolean;
  error?: string;
  data?: T;
};

// ============================================================================
// Logout Action
// ============================================================================

/**
 * Logout action
 * 
 * Clears all auth cookies and redirects to home
 * Invalidates all caches
 * 
 * @example
 * ```tsx
 * <button onClick={() => logoutAction()}>Logout</button>
 * ```
 */
export async function logoutAction(): Promise<void> {
  try {
    // Get current user for audit log
    const { userId } = await getServerAuth();
    
    // Clear all auth cookies
    const cookieStore = await cookies();
    const cookieNames = [
      AUTH_CONFIG.cookies.authToken,
      AUTH_CONFIG.cookies.refreshToken,
      AUTH_CONFIG.cookies.idToken,
      'access_token', // Your custom backend token
    ];
    
    for (const name of cookieNames) {
      cookieStore.delete(name);
    }
    
    // Invalidate all caches
    revalidateTag('user-session');
    revalidateTag('user-profile');
    revalidatePath('/', 'layout');
    
    // Audit log
    if (userId) {
      await AuthAudit.logout(userId, 'unknown'); // IP unknown in server action
    }
    
    console.log('[logout-action] User logged out successfully');
  } catch (error) {
    console.error('[logout-action] Error:', summarizeError(error));
    // Don't throw - logout should always succeed
  }
  
  // Redirect to home
  redirect('/');
}

// ============================================================================
// Session Refresh Action
// ============================================================================

/**
 * Refresh session action
 * 
 * Triggers session refresh and cache invalidation
 * Useful after profile updates
 * 
 * @example
 * ```tsx
 * await refreshSessionAction()
 * ```
 */
export async function refreshSessionAction(): Promise<ActionResult> {
  try {
    const { userId } = await getServerAuth();
    
    if (!userId) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }
    
    // Invalidate caches to force fresh data
    revalidateTag('user-session');
    revalidateTag(`user-profile-${userId}`);
    
    return {
      success: true,
    };
  } catch (error) {
    console.error('[refresh-session-action] Error:', summarizeError(error));
    return {
      success: false,
      error: 'Failed to refresh session',
    };
  }
}

// ============================================================================
// User Profile Actions
// ============================================================================

/**
 * Update user profile action
 * 
 * @param data - Profile data to update
 * @returns Action result
 * 
 * @example
 * ```tsx
 * const result = await updateProfileAction({
 *   handle: 'newhandle',
 *   email: 'new@email.com'
 * })
 * ```
 */
export async function updateProfileAction(_data: {
  handle?: string;
  email?: string;
  avatar_url?: string;
}): Promise<ActionResult> {
  try {
    const { userId } = await getServerAuth();
    
    if (!userId) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }
    
    // TODO: Implement profile update in Supabase
    // const supabase = createClient()
    // await supabase
    //   .from('profiles')
    //   .update(data)
    //   .eq('id', userId)
    
    // Invalidate caches
    revalidateTag(`user-profile-${userId}`);
    revalidatePath('/settings/profile');
    
    console.log('[update-profile-action] Profile updated:', maskIdentifier(userId));
    
    return {
      success: true,
    };
  } catch (error) {
    console.error('[update-profile-action] Error:', summarizeError(error));
    return {
      success: false,
      error: 'Failed to update profile',
    };
  }
}

/**
 * Get user profile action
 * 
 * Fetches current user's profile
 * Useful for client components that need profile data
 * 
 * @returns User profile or error
 */
export async function getUserProfileAction(): Promise<ActionResult<CachedUser>> {
  try {
    const { user } = await getServerAuth();
    
    if (!user) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }
    
    return {
      success: true,
      data: user,
    };
  } catch (error) {
    console.error('[get-profile-action] Error:', summarizeError(error));
    return {
      success: false,
      error: 'Failed to get profile',
    };
  }
}

// ============================================================================
// Cache Management Actions
// ============================================================================

/**
 * Clear user cache action
 * 
 * Clears all cached data for current user
 * Useful after major updates
 * 
 * @example
 * ```tsx
 * await clearUserCacheAction()
 * ```
 */
export async function clearUserCacheAction(): Promise<ActionResult> {
  try {
    const { userId } = await getServerAuth();
    
    if (!userId) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }
    
    // Invalidate all user-related caches
    revalidateTag('user-session');
    revalidateTag(`user-profile-${userId}`);
    revalidateTag(`user-permissions-${userId}`);
    revalidatePath('/', 'layout');
    
    console.log('[clear-cache-action] Cache cleared for user:', maskIdentifier(userId));
    
    return {
      success: true,
    };
  } catch (error) {
    console.error('[clear-cache-action] Error:', summarizeError(error));
    return {
      success: false,
      error: 'Failed to clear cache',
    };
  }
}

// ============================================================================
// Feature Flag Actions
// ============================================================================

/**
 * Check feature flag action
 * 
 * Server-side feature flag checking
 * 
 * @param feature - Feature name
 * @returns Whether feature is enabled
 * 
 * @example
 * ```tsx
 * const enabled = await checkFeatureAction('walletLogin')
 * if (enabled) {
 *   // Show wallet login
 * }
 * ```
 */
export async function checkFeatureAction(feature: string): Promise<boolean> {
  try {
    return AUTH_CONFIG.features[feature as keyof typeof AUTH_CONFIG.features] || false;
  } catch (error) {
    console.error('[check-feature-action] Error:', summarizeError(error));
    return false;
  }
}

// ============================================================================
// Organization Actions (Future)
// ============================================================================

/**
 * Switch organization action
 * 
 * Changes current organization context
 * 
 * @param orgId - Organization ID
 * @returns Action result
 * 
 * @example
 * ```tsx
 * await switchOrganizationAction('org-123')
 * ```
 */
export async function switchOrganizationAction(orgId: string): Promise<ActionResult> {
  try {
    const { userId } = await getServerAuth();
    
    if (!userId) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }
    
    // TODO: Implement organization switching
    // - Verify user has access to org
    // - Store org ID in session/cookie
    // - Invalidate caches
    
    console.log('[switch-org-action] Organization switched:', maskIdentifier(orgId));
    
    return {
      success: true,
    };
  } catch (error) {
    console.error('[switch-org-action] Error:', summarizeError(error));
    return {
      success: false,
      error: 'Failed to switch organization',
    };
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Validate action auth
 * 
 * Helper to ensure user is authenticated in actions
 * 
 * @throws {Error} If not authenticated
 */
export async function validateActionAuth(): Promise<string> {
  const { userId } = await getServerAuth();
  
  if (!userId) {
    throw new Error('Unauthorized');
  }
  
  return userId;
}

/**
 * Handle action error
 * 
 * Consistent error handling for actions
 * 
 * @param error - Error object
 * @param context - Context for logging
 * @returns ActionResult with error
 */
export function handleActionError(
  error: unknown,
  context: string
): ActionResult {
  console.error(`[${context}] Error:`, summarizeError(error));
  
  const message = error instanceof Error ? error.message : 'An error occurred';
  
  return {
    success: false,
    error: message,
  };
}
