/**
 * Bookmarks and Favorites operations
 */

import { supabase, ErrorService } from './client'

// ============================================================================
// BOOKMARKS
// ============================================================================

export async function bookmarkAsset(userId: string, assetId: string) {
  const { error } = await supabase
    .from('bookmarks')
    .insert({ user_id: userId, asset_id: assetId })
    .select()
    .single();

  if (error && error.code !== '23505') { // Ignore duplicate
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        assetId,
        table: 'bookmarks',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'bookmarks'
      }
    });
    throw error;
  }
}

export async function unbookmarkAsset(userId: string, assetId: string) {
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('user_id', userId)
    .eq('asset_id', assetId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        assetId,
        table: 'bookmarks',
        operation: 'DELETE'
      },
      tags: {
        layer: 'database',
        table: 'bookmarks'
      }
    });
    throw error;
  }
}

export async function isBookmarked(userId: string, assetId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('user_id')
    .eq('user_id', userId)
    .eq('asset_id', assetId)
    .single();

  return !!data && !error;
}

export async function getUserBookmarks(userId: string) {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('asset_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        table: 'bookmarks',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'bookmarks'
      }
    });
    return [];
  }

  return data || [];
}

// ============================================================================
// FAVORITES
// ============================================================================

/**
 * Get user's favorites for a specific org
 */
export async function getFavorites(userId: string, orgId: string) {
  const { data, error } = await supabase.rpc('get_user_favorites', {
    p_user_id: userId,
    p_org_id: orgId
  });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        orgId,
        function: 'get_user_favorites',
        operation: 'RPC'
      },
      tags: {
        layer: 'database',
        function: 'rpc'
      }
    });
    return [];
  }

  return data || [];
}
