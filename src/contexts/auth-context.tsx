'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { refreshAuthToken } from '@/lib/auth/refresh';
import { isPrivyAuth } from '@/lib/auth/client-config';
import type { ServerAuth } from '@/lib/auth/server-utils';
import type { CachedUser } from '@/lib/auth/cache';
import { summarizeError } from '@/lib/logging/safe-log';

interface AuthContextType {
  ready: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: CachedUser | null;
  login: () => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? ''

// ─── Privy-backed auth (cloud / when NEXT_PUBLIC_PRIVY_APP_ID is set) ───

function PrivyAuthProvider({
  children,
  serverAuth,
}: {
  children: ReactNode;
  serverAuth: ServerAuth;
}) {
  const {
    ready,
    authenticated,
    user: privyUser,
    login: privyLogin,
    logout: privyLogout,
    getAccessToken,
  } = usePrivy();

  const [initialAuth] = useState(serverAuth);
  const [user, setUser] = useState(initialAuth.user);
  const _router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated && user && !initialAuth.isAuthenticated) {
      setUser(null);
      return;
    }
    if (authenticated && !user) {
      fetch('/api/user/me')
        .then(res => res.json())
        .then(data => {
          if (data.user) setUser(data.user);
        })
        .catch(error => {
          console.error('[AuthProvider] Failed to fetch user:', summarizeError(error));
        });
      return;
    }
  }, [ready, authenticated, user, initialAuth.isAuthenticated]);

  const bridgeServerSession = useCallback(async (): Promise<boolean> => {
    if (!authenticated) return false;

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return false;

      const response = await fetch('/api/auth/privy-login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        console.warn('[auth-context] Privy auth bridge failed:', response.status);
        return false;
      }

      await fetch('/api/user/me', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
          if (data.user) setUser(data.user);
        })
        .catch(() => {});

      return true;
    } catch (error) {
      console.error('[auth-context] Privy session bridge error:', summarizeError(error));
      return false;
    }
  }, [authenticated, getAccessToken]);

  // Auto-refresh token periodically
  useEffect(() => {
    if (!authenticated || !ready) return;
    const interval = setInterval(async () => {
      const refreshed = await refreshAuthToken();
      if (!refreshed) {
        await bridgeServerSession();
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [authenticated, bridgeServerSession, ready]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (isRefreshing) return false;
    setIsRefreshing(true);
    try {
      const refreshed = await refreshAuthToken();
      if (refreshed) return true;
      return await bridgeServerSession();
    } finally {
      setIsRefreshing(false);
    }
  }, [bridgeServerSession, isRefreshing]);

  const login = useCallback(() => {
    privyLogin();
  }, [privyLogin]);

  const logout = useCallback(async () => {
    try {
      setIsLoggingOut(true);
      setUser(null);
      await fetch('/api/auth/clear-token', { method: 'POST', credentials: 'include' });
      await privyLogout();
      window.location.href = '/';
    } catch (error) {
      console.error('[auth-context] Logout error:', summarizeError(error));
      window.location.href = '/';
    }
  }, [privyLogout]);

  const value: AuthContextType = useMemo(() => ({
    ready,
    isAuthenticated: ready ? (authenticated || Boolean(user) || initialAuth.isAuthenticated) : initialAuth.isAuthenticated,
    isLoading: !ready && !initialAuth.isAuthenticated,
    user,
    login,
    logout,
    refreshSession,
  }), [ready, authenticated, initialAuth.isAuthenticated, user, login, logout, refreshSession]);

  // Suppress privyUser lint (used to trigger re-renders)
  void privyUser;

  if (isLoggingOut) return null;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Local auth (self-hosted / GoTrue — no Privy dependency) ───

function LocalAuthProvider({
  children,
  serverAuth,
}: {
  children: ReactNode;
  serverAuth: ServerAuth;
}) {
  const [initialAuth] = useState(serverAuth);
  const [user, setUser] = useState(initialAuth.user);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // No SDK to initialize — always ready
  const ready = true;
  const isAuthenticated = !!user;

  // Fetch user data if server says authenticated but no user object
  useEffect(() => {
    if (initialAuth.isAuthenticated && !user) {
      fetch('/api/user/me')
        .then(res => res.json())
        .then(data => {
          if (data.user) setUser(data.user);
        })
        .catch(error => {
          console.error('[AuthProvider] Failed to fetch user:', summarizeError(error));
        });
    }
  }, [initialAuth.isAuthenticated, user]);

  // Auto-refresh token periodically
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(async () => {
      await refreshAuthToken();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (isRefreshing) return false;
    setIsRefreshing(true);
    try {
      return await refreshAuthToken();
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const login = useCallback(() => {
    window.location.href = '/login';
  }, []);

  const logout = useCallback(async () => {
    try {
      setIsLoggingOut(true);
      setUser(null);
      await fetch('/api/auth/clear-token', { method: 'POST', credentials: 'include' });
      window.location.href = '/';
    } catch (error) {
      console.error('[auth-context] Logout error:', summarizeError(error));
      window.location.href = '/';
    }
  }, []);

  const value: AuthContextType = useMemo(() => ({
    ready,
    isAuthenticated,
    isLoading: false,
    user,
    login,
    logout,
    refreshSession,
  }), [ready, isAuthenticated, user, login, logout, refreshSession]);

  if (isLoggingOut) return null;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Public exports ───

export function AuthProvider({
  children,
  serverAuth,
}: {
  children: ReactNode;
  serverAuth: ServerAuth;
}) {
  if (isPrivyAuth() && PRIVY_APP_ID) {
    return <PrivyAuthProvider serverAuth={serverAuth}>{children}</PrivyAuthProvider>;
  }
  return <LocalAuthProvider serverAuth={serverAuth}>{children}</LocalAuthProvider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
