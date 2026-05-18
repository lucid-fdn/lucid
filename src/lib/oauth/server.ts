/**
 * Server-side OAuth data fetching
 * Fetches OAuth providers and connections from Nango backend
 * Used for root-level data loading (following the centralized pattern)
 */

import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';

const NANGO_API_URL = process.env.NEXT_PUBLIC_OAUTH_API_URL || 'http://localhost:3001';

/**
 * Get OAuth providers (cached per request).
 */
export const getOAuthProviders = cache(async () => {
  try {
    const response = await fetch(`${NANGO_API_URL}/api/oauth/providers`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('[OAuth] Failed to fetch providers:', response.status);
      return [];
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      console.warn('[OAuth] Providers endpoint returned non-JSON — Nango server may be down');
      return [];
    }

    const data = await response.json();
    return data.providers || [];
  } catch (error) {
    console.error('[OAuth] Error fetching providers:', error);
    return [];
  }
});

/**
 * Get OAuth connections for a user (cached per request).
 * Requires Privy DID (did:privy:xxx) — Nango stores connections keyed by this ID.
 */
export const getOAuthConnections = cache(async (privyUserId?: string) => {
  if (!privyUserId) return [];

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;

    const response = await fetch(`${baseUrl}/api/oauth/connections`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `privy-token=${(await cookies()).get('privy-token')?.value}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) return [];

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return [];

    const data = await response.json();
    return data.connections || [];
  } catch (error) {
    console.error('[OAuth] Error fetching connections:', error);
    return [];
  }
});

/**
 * Get both providers and connections in parallel.
 */
export async function getOAuthData(privyUserId?: string) {
  const [providers, connections] = await Promise.all([
    getOAuthProviders(),
    getOAuthConnections(privyUserId),
  ]);

  return { providers, connections };
}
