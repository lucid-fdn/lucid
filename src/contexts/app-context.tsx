'use client';

/**
 * Unified App Context - Merges Auth + Profile + Workspace
 * 
 * WHY: Reduces provider cascade renders
 * - Before: AuthProvider → ProfileProvider → WorkspaceProvider (3 cascades)
 * - After: AppProvider (1 provider, no cascade)
 * 
 * Result: Fewer re-renders, better performance
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { useAuth as usePrivyAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { refreshAuthToken } from '@/lib/auth/refresh';
import type { ServerAuth } from '@/lib/auth/server-utils';
import type { CachedUser } from '@/lib/auth/cache';
import { summarizeError } from '@/lib/logging/safe-log';

const DEBUG_APP_CONTEXT = process.env.NEXT_PUBLIC_DEBUG_APP_CONTEXT === 'true';

function debugAppContext(message: string, metadata?: Record<string, unknown>) {
  if (!DEBUG_APP_CONTEXT) return;
  console.debug(`[AppProvider] ${message}`, metadata);
}

// ============================================================================
// Types
// ============================================================================

/** Workspace data shape returned from API */
interface WorkspaceData {
  id: string;
  name: string;
  slug: string;
  [key: string]: unknown;
}

/** Organization data shape */
interface OrgData {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface AppContextType {
  // Auth
  ready: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: CachedUser | null;
  login: () => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;

  // Profile
  profile: CachedUser | null;
  profileLoading: boolean;

  // Workspace
  workspace: WorkspaceData | null;
  workspaceLoading: boolean;
  currentOrg: OrgData | null;
}

const AppContext = createContext<AppContextType | null>(null);

// ============================================================================
// Unified App Provider
// ============================================================================

export function AppProvider({ 
  children,
  serverAuth,
  initialProfile,
  initialOrg
}: { 
  children: ReactNode;
  serverAuth: ServerAuth;
  initialProfile?: CachedUser | null;
  initialOrg?: OrgData | null;
}) {
  const mountTime = React.useRef(Date.now());
  const router = useRouter();
  
  // Auth hooks (provider-agnostic)
  const { ready, isAuthenticated: authenticated, login: privyLogin, logout: privyLogout } = usePrivyAuth();
  
  // ============================================================================
  // Auth State
  // ============================================================================
  
  const [initialAuth] = useState(serverAuth);
  const [user, setUser] = useState(initialAuth.user);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // ============================================================================
  // Profile State
  // ============================================================================
  
  const [profile, setProfile] = useState<CachedUser | null>(initialProfile || null);
  const [profileLoading, _setProfileLoading] = useState(false);
  
  // ============================================================================
  // Workspace State
  // ============================================================================
  
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [workspaceLoading, _setWorkspaceLoading] = useState(false);
  const [currentOrg] = useState<OrgData | null>(initialOrg || null);
  
  // ============================================================================
  // Effects - All in one place, coordinated
  // ============================================================================
  
  // Track Privy ready
  useEffect(() => {
    if (ready) {
      const readyDuration = Date.now() - mountTime.current;
      debugAppContext('Privy ready', {
        duration_ms: readyDuration,
        authenticated
      });
    }
  }, [ready, authenticated]);
  
  // Single effect for all data fetching - coordinated!
  useEffect(() => {
    async function fetchAppData() {
      if (!ready) {
        debugAppContext('Waiting for Privy');
        return;
      }
      
      if (!authenticated) {
        debugAppContext('Not authenticated, clearing data');
        setUser(null);
        setProfile(null);
        setWorkspace(null);
        return;
      }
      
      // Already have user from server
      if (user) {
        debugAppContext('Have user from server');
        return;
      }
      
      // Fetch user if needed
      debugAppContext('Fetching user');
      try {
        const res = await fetch('/api/user/profile');
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
          setProfile(userData); // Profile is same as user for now
        }
      } catch (error) {
        console.error('[AppProvider] Fetch error:', summarizeError(error));
      }
    }
    
    fetchAppData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [ready, authenticated]); // ✅ No user dependency
  
  // Auto-refresh token
  useEffect(() => {
    if (!authenticated || !ready) return;
    
    const interval = setInterval(async () => {
      await refreshAuthToken();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [authenticated, ready]);
  
  // ============================================================================
  // Callbacks - All memoized
  // ============================================================================
  
  const login = useCallback(() => {
    privyLogin();
  }, [privyLogin]);
  
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/clear-token', {
        method: 'POST',
        credentials: 'include'
      });
      
      await privyLogout();
      router.push('/');
    } catch (error) {
      console.error('[AppProvider] Logout error:', summarizeError(error));
      router.push('/');
    }
  }, [privyLogout, router]);
  
  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (isRefreshing) return false;
    
    setIsRefreshing(true);
    try {
      const success = await refreshAuthToken();
      return success;
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);
  
  // ============================================================================
  // Memoized Context Value - Single state object
  // ============================================================================
  
  const value: AppContextType = useMemo(() => ({
    // Auth
    ready,
    isAuthenticated: ready ? authenticated : initialAuth.isAuthenticated,
    isLoading: !ready && !initialAuth.isAuthenticated,
    user,
    login,
    logout,
    refreshSession,
    
    // Profile
    profile,
    profileLoading,
    
    // Workspace
    workspace,
    workspaceLoading,
    currentOrg,
  }), [
    ready,
    authenticated,
    initialAuth.isAuthenticated,
    user,
    login,
    logout,
    refreshSession,
    profile,
    profileLoading,
    workspace,
    workspaceLoading,
    currentOrg
  ]);
  
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ============================================================================
// Hooks - Convenience accessors
// ============================================================================

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}

// Backwards compatibility - separate hooks
export function useAuth() {
  const { ready, isAuthenticated, isLoading, user, login, logout, refreshSession } = useApp();
  return { ready, isAuthenticated, isLoading, user, login, logout, refreshSession };
}

export function useProfile() {
  const { profile, profileLoading } = useApp();
  return { profile, loading: profileLoading };
}

export function useWorkspace() {
  const { workspace, workspaceLoading, currentOrg } = useApp();
  return { workspace, loading: workspaceLoading, currentOrg };
}
