/**
 * Server-Side Auth Utilities
 * 
 * Simple, type-safe functions for server components and server actions
 * Uses caching layer for optimal performance
 * 
 * @example
 * ```tsx
 * // Protected page
 * export default async function DashboardPage() {
 *   const { user } = await getServerAuth()
 *   return <div>Welcome {user.handle}!</div>
 * }
 * 
 * // Require auth (throws if not authenticated)
 * export default async function SettingsPage() {
 *   const { user } = await requireServerAuth()
 *   // Guaranteed to have user here
 * }
 * ```
 */

import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { getCachedSession, getCachedPermissions, type CachedUser } from './cache';
import { getServerSession } from './session';
import { AUTH_CONFIG } from './config';
import { redactLogMetadata } from '@/lib/logging/safe-log';

// ============================================================================
// Types
// ============================================================================

export type ServerAuth = {
  userId: string | null;
  user: CachedUser | null;
  isAuthenticated: boolean;
};

export type RequiredServerAuth = {
  userId: string;
  user: CachedUser;
  isAuthenticated: true;
};

export type ServerAuthWithPermissions = ServerAuth & {
  permissions: string[];
  hasPermission: (permission: string) => boolean;
};

// ============================================================================
// Core Auth Functions
// ============================================================================

/**
 * Get server auth (nullable)
 * 
 * Returns auth state with user data, or null if not authenticated
 * Uses caching layer for performance
 * 
 * @example
 * ```tsx
 * const { user, isAuthenticated } = await getServerAuth()
 * if (isAuthenticated) {
 *   return <Dashboard user={user!} />
 * }
 * return <Login />
 * ```
 */
export async function getServerAuth(): Promise<ServerAuth> {
  try {
    const session = await getCachedSession();
    
    return {
      userId: session.userId,
      user: session.user || null,
      isAuthenticated: !!session.userId,
    };
  } catch (error) {
    console.error('[server-utils] getServerAuth error:', error);
    return {
      userId: null,
      user: null,
      isAuthenticated: false,
    };
  }
}

/**
 * Require server auth (throws if not authenticated)
 * 
 * Use this when you need guaranteed authentication
 * Automatically redirects to login if not authenticated
 * 
 * @throws {Error} Redirects to /login if not authenticated
 * 
 * @example
 * ```tsx
 * export default async function ProtectedPage() {
 *   const { user } = await requireServerAuth()
 *   // TypeScript knows user is defined here
 *   return <div>Welcome {user.handle}!</div>
 * }
 * ```
 */
export async function requireServerAuth(): Promise<RequiredServerAuth> {
  const auth = await getServerAuth();
  
  if (!auth.isAuthenticated || !auth.user) {
    // Redirect to login
    redirect('/login');
  }
  
  return {
    userId: auth.userId!,
    user: auth.user,
    isAuthenticated: true,
  };
}

/**
 * Get server auth with permissions
 * 
 * Includes permission checking utilities
 * 
 * @example
 * ```tsx
 * const auth = await getServerAuthWithPermissions()
 * if (auth.hasPermission('admin.users.delete')) {
 *   return <DeleteUserButton />
 * }
 * ```
 */
export async function getServerAuthWithPermissions(): Promise<ServerAuthWithPermissions> {
  const auth = await getServerAuth();
  
  if (!auth.isAuthenticated || !auth.userId) {
    return {
      ...auth,
      permissions: [],
      hasPermission: () => false,
    };
  }
  
  const permissions = await getCachedPermissions(auth.userId);
  
  return {
    ...auth,
    permissions,
    hasPermission: (permission: string) => permissions.includes(permission),
  };
}

/**
 * Get server user (nullable)
 * 
 * Convenience function to get just the user
 * 
 * @example
 * ```tsx
 * const user = await getServerUser()
 * if (user) {
 *   return <UserProfile user={user} />
 * }
 * ```
 */
export async function getServerUser(): Promise<CachedUser | null> {
  const { user } = await getServerAuth();
  return user;
}

/**
 * Require server user (throws if not authenticated)
 * 
 * Convenience function to get guaranteed user
 * 
 * @throws {Error} Redirects to /login if not authenticated
 */
export async function requireServerUser(): Promise<CachedUser> {
  const { user } = await requireServerAuth();
  return user;
}

/**
 * Get user ID (nullable)
 * 
 * Convenience function to get just the user ID
 * 
 * @example
 * ```tsx
 * const userId = await getUserId()
 * if (userId) {
 *   const chats = await getChats(userId)
 * }
 * ```
 */
export async function getUserId(): Promise<string | null> {
  const { userId } = await getServerSession();
  return userId;
}

/**
 * Require user ID (throws if not authenticated)
 * 
 * Convenience function to get guaranteed user ID
 * 
 * @throws {Error} Redirects to /login if not authenticated
 */
export async function requireUserId(): Promise<string> {
  const { userId } = await getServerSession();
  if (!userId) {
    redirect('/login');
  }
  return userId;
}

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if user has permission
 * 
 * @param permission - Permission string (e.g., 'admin.users.delete')
 * @returns true if user has permission, false otherwise
 * 
 * @example
 * ```tsx
 * if (await hasPermission('admin.users.view')) {
 *   return <AdminPanel />
 * }
 * ```
 */
export async function hasPermission(permission: string): Promise<boolean> {
  const { hasPermission: checkPerm } = await getServerAuthWithPermissions();
  return checkPerm(permission);
}

/**
 * Require permission (throws if user doesn't have it)
 * 
 * @param permission - Permission string
 * @throws {Error} If user doesn't have permission
 * 
 * @example
 * ```tsx
 * export default async function AdminPage() {
 *   await requirePermission('admin.access')
 *   // User definitely has permission here
 * }
 * ```
 */
export async function requirePermission(permission: string): Promise<void> {
  const hasPermi = await hasPermission(permission);
  
  if (!hasPermi) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

// ============================================================================
// Role Checking
// ============================================================================

/**
 * Check if user has role
 * 
 * @param role - Role name (e.g., 'admin', 'moderator')
 * @returns true if user has role, false otherwise
 * 
 * @example
 * ```tsx
 * if (await hasRole('admin')) {
 *   return <AdminDashboard />
 * }
 * ```
 */
export async function hasRole(role: string): Promise<boolean> {
  const { permissions } = await getServerAuthWithPermissions();
  
  // Roles are stored as permissions like 'role:admin'
  return permissions.includes(`role:${role}`);
}

/**
 * Require role (throws if user doesn't have it)
 * 
 * @param role - Role name
 * @throws {Error} If user doesn't have role
 */
export async function requireRole(role: string): Promise<void> {
  const hasR = await hasRole(role);
  
  if (!hasR) {
    throw new Error(`Role required: ${role}`);
  }
}

// ============================================================================
// Organization Context
// ============================================================================

/**
 * Get current workspace (organization) ID
 * 
 * Returns the user's current workspace context
 * Falls back to personal workspace if no specific workspace selected
 * 
 * @returns Workspace (organization) ID or null
 * 
 * @example
 * ```tsx
 * const workspaceId = await getCurrentWorkspaceId()
 * const data = await getWorkspaceData(workspaceId)
 * ```
 */
export async function getCurrentWorkspaceId(): Promise<string | null> {
  try {
    const { userId } = await getServerAuth();
    
    if (!userId) {
      return null;
    }
    
    // Get user's default/personal workspace
    // This uses the same pattern as getCachedUser
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: orgs, error } = await supabase
      .from('organization_members')
      .select('organization_id, organizations(id, name, type)')
      .eq('user_id', userId)
      .limit(1)
      .single();
    
    if (error || !orgs) {
      return null;
    }
    
    return orgs.organization_id;
  } catch (error) {
    console.error('[server-utils] getCurrentWorkspaceId error:', error);
    return null;
  }
}

/**
 * Get current organization ID (alias for getCurrentWorkspaceId)
 * Kept for backwards compatibility
 */
export async function getCurrentOrgId(): Promise<string | null> {
  return getCurrentWorkspaceId();
}

/**
 * Require organization context
 * 
 * @throws {Error} If no organization context
 */
export async function requireOrgContext(): Promise<string> {
  const orgId = await getCurrentOrgId();
  
  if (!orgId) {
    throw new Error('Organization context required');
  }
  
  return orgId;
}

// ============================================================================
// Feature Flag Integration
// ============================================================================

/**
 * Get auth features for current user
 * 
 * Combines global feature flags with user-specific flags
 * 
 * @returns Object with feature flags
 * 
 * @example
 * ```tsx
 * const features = await getAuthFeatures()
 * if (features.walletLogin) {
 *   return <WalletLoginButton />
 * }
 * ```
 */
export async function getAuthFeatures() {
  const { isAuthenticated } = await getServerAuth();
  
  return {
    ...AUTH_CONFIG.features,
    // Could add user-specific overrides here
    isAuthenticated,
  };
}

// ============================================================================
// Audit Integration
// ============================================================================

/**
 * Get request metadata for audit logging
 * 
 * @returns Object with IP and user agent
 */
async function getRequestMetadata() {
  // In server components, we can't directly access request
  // This would need to be passed from middleware or API route
  
  return {
    ip: 'unknown',
    userAgent: 'unknown',
  };
}

/**
 * Log auth event
 * 
 * @param event - Event name
 * @param metadata - Additional metadata
 */
export async function logAuthEvent(event: string, metadata?: Record<string, unknown>) {
  const { userId } = await getServerAuth();
  const requestMeta = await getRequestMetadata();
  
  // Use existing audit system
  console.log('[auth-event]', redactLogMetadata({
    event,
    userId,
    ...requestMeta,
    ...metadata,
    timestamp: new Date().toISOString(),
  }));
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if current user is the owner of a resource
 * 
 * @param resourceOwnerId - ID of the resource owner
 * @returns true if current user is the owner
 * 
 * @example
 * ```tsx
 * const post = await getPost(id)
 * if (await isOwner(post.userId)) {
 *   return <EditButton />
 * }
 * ```
 */
export async function isOwner(resourceOwnerId: string): Promise<boolean> {
  const userId = await getUserId();
  return userId === resourceOwnerId;
}

/**
 * Require ownership of a resource
 * 
 * @param resourceOwnerId - ID of the resource owner
 * @throws {Error} If user is not the owner
 * 
 * @example
 * ```tsx
 * export async function deletePost(postId: string) {
 *   const post = await getPost(postId)
 *   await requireOwnership(post.userId)
 *   // User is definitely the owner here
 *   await db.delete(post)
 * }
 * ```
 */
export async function requireOwnership(resourceOwnerId: string): Promise<void> {
  const isOwn = await isOwner(resourceOwnerId);
  
  if (!isOwn) {
    throw new Error('You do not own this resource');
  }
}

/**
 * Check if user can access resource
 * 
 * Checks both ownership and permissions
 * 
 * @param resourceOwnerId - ID of the resource owner
 * @param requiredPermission - Permission needed if not owner
 * @returns true if user can access
 * 
 * @example
 * ```tsx
 * const post = await getPost(id)
 * if (await canAccess(post.userId, 'posts.edit')) {
 *   return <EditPostForm post={post} />
 * }
 * ```
 */
export async function canAccess(
  resourceOwnerId: string,
  requiredPermission: string
): Promise<boolean> {
  // Check if owner
  if (await isOwner(resourceOwnerId)) {
    return true;
  }
  
  // Check if has permission
  return hasPermission(requiredPermission);
}
