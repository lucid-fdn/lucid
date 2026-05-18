/**
 * Marketplace Actions Hooks
 * 
 * React hooks for marketplace user actions (bookmark, rate)
 * Industry standard: Optimistic updates with React Query
 */

'use client';

import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { notificationCopy } from '@/lib/notifications/copy'

interface BookmarkParams {
  assetId: string;
}

interface RateParams {
  assetId: string;
  score: number;
  comment?: string;
}

/**
 * Hook for bookmarking assets
 * 
 * @example
 * const { bookmark, unbookmark, isBookmarking } = useBookmark();
 * 
 * <Button onClick={() => bookmark({ assetId: 'hf-gpt2' })}>
 *   Bookmark
 * </Button>
 */
export function useBookmark() {
  const queryClient = useQueryClient();
  const toast = useToast();
  
  const bookmarkMutation = useMutation({
    mutationFn: async ({ assetId }: BookmarkParams) => {
      // URL encode to handle slashes in asset IDs
      const encodedId = encodeURIComponent(assetId);
      const response = await fetch(`/api/v2/marketplace/assets/${encodedId}/bookmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to bookmark');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate queries to refetch with updated bookmark state
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['asset', variables.assetId] });
      
      toast.success('Bookmarked', 'Asset added to your bookmarks');
    },
    onError: (error: Error) => {
      toast.error(notificationCopy.title.error, error.message);
    },
  });
  
  const unbookmarkMutation = useMutation({
    mutationFn: async ({ assetId }: BookmarkParams) => {
      // URL encode to handle slashes in asset IDs
      const encodedId = encodeURIComponent(assetId);
      const response = await fetch(`/api/v2/marketplace/assets/${encodedId}/bookmark`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to unbookmark');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['asset', variables.assetId] });
      
      toast.success('Removed', 'Asset removed from bookmarks');
    },
    onError: (error: Error) => {
      toast.error(notificationCopy.title.error, error.message);
    },
  });
  
  return {
    bookmark: bookmarkMutation.mutate,
    unbookmark: unbookmarkMutation.mutate,
    isBookmarking: bookmarkMutation.isPending,
    isUnbookmarking: unbookmarkMutation.isPending,
  };
}

/**
 * Hook for rating assets
 * 
 * @example
 * const { rate, deleteRating, isRating } = useRating();
 * 
 * <Button onClick={() => rate({ assetId: 'hf-gpt2', score: 5 })}>
 *   Rate 5 Stars
 * </Button>
 */
export function useRating() {
  const queryClient = useQueryClient();
  const toast = useToast();
  
  const rateMutation = useMutation({
    mutationFn: async ({ assetId, score, comment }: RateParams) => {
      const response = await fetch(`/api/v2/marketplace/assets/${assetId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, comment }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to rate');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['asset', variables.assetId] });
      
      toast.success('Rating submitted', `You rated this asset ${variables.score} stars`);
    },
    onError: (error: Error) => {
      toast.error(notificationCopy.title.error, error.message);
    },
  });
  
  const deleteRatingMutation = useMutation({
    mutationFn: async ({ assetId }: BookmarkParams) => {
      const response = await fetch(`/api/v2/marketplace/assets/${assetId}/rate`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete rating');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['asset', variables.assetId] });
      
      toast.success('Rating removed', 'Your rating has been deleted');
    },
    onError: (error: Error) => {
      toast.error(notificationCopy.title.error, error.message);
    },
  });
  
  return {
    rate: rateMutation.mutate,
    deleteRating: deleteRatingMutation.mutate,
    isRating: rateMutation.isPending,
    isDeletingRating: deleteRatingMutation.isPending,
  };
}

/**
 * Hook for marketplace search with React Query
 * 
 * @example
 * const { data, isLoading } = useMarketplaceSearch({
 *   q: 'nlp',
 *   kind: 'MODEL',
 *   limit: 24
 * });
 */
export function useMarketplaceSearch(params: {
  q?: string;
  kind?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['marketplace', 'search', params],
    queryFn: async () => {
      const url = new URL('/api/v2/marketplace/search', window.location.origin);
      if (params.q) url.searchParams.set('q', params.q);
      if (params.kind) url.searchParams.set('kind', params.kind);
      if (params.limit) url.searchParams.set('limit', params.limit.toString());
      if (params.offset) url.searchParams.set('offset', params.offset.toString());
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook for following contributors
 * 
 * @example
 * const { follow, unfollow, isFollowing } = useFollowContributor();
 * 
 * <Button onClick={() => follow({ handle: 'john-doe' })}>
 *   Follow
 * </Button>
 */
export function useFollowContributor() {
  const queryClient = useQueryClient();
  const toast = useToast();
  
  const followMutation = useMutation({
    mutationFn: async ({ handle }: { handle: string }) => {
      const response = await fetch(`/api/v2/marketplace/contributors/${handle}/follow`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to follow');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contributor', variables.handle] });
      
      toast.success('Following', 'You are now following this contributor');
    },
    onError: (error: Error) => {
      toast.error(notificationCopy.title.error, error.message);
    },
  });
  
  const unfollowMutation = useMutation({
    mutationFn: async ({ handle }: { handle: string }) => {
      const response = await fetch(`/api/v2/marketplace/contributors/${handle}/follow`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to unfollow');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contributor', variables.handle] });
      
      toast.success('Unfollowed', 'You unfollowed this contributor');
    },
    onError: (error: Error) => {
      toast.error(notificationCopy.title.error, error.message);
    },
  });
  
  return {
    follow: followMutation.mutate,
    followAsync: followMutation.mutateAsync,
    unfollow: unfollowMutation.mutate,
    unfollowAsync: unfollowMutation.mutateAsync,
    isFollowing: followMutation.isPending,
    isUnfollowing: unfollowMutation.isPending,
  };
}

/**
 * Hook for following organizations
 * 
 * @example
 * const { follow, unfollow, isFollowing } = useFollowOrganization();
 * 
 * <Button onClick={() => follow({ orgId: 'org-123' })}>
 *   Follow
 * </Button>
 */
export function useFollowOrganization() {
  const queryClient = useQueryClient();
  const toast = useToast();
  
  const followMutation = useMutation({
    mutationFn: async ({ orgId }: { orgId: string }) => {
      const response = await fetch(`/api/v2/marketplace/organizations/${orgId}/follow`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to follow');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organization', variables.orgId] });
      
      // Only show toast if not mock mode
      if (!data.message?.includes('Mock')) {
        toast.success('Following', 'You are now following this organization');
      }
    },
    onError: (error: Error) => {
      console.error('[useFollowOrganization] Error:', error);
      toast.error(notificationCopy.title.error, error.message);
    },
  });
  
  const unfollowMutation = useMutation({
    mutationFn: async ({ orgId }: { orgId: string }) => {
      const response = await fetch(`/api/v2/marketplace/organizations/${orgId}/follow`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to unfollow');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organization', variables.orgId] });
      
      // Only show toast if not mock mode
      if (!data.message?.includes('Mock')) {
        toast.success('Unfollowed', 'You unfollowed this organization');
      }
    },
    onError: (error: Error) => {
      console.error('[useFollowOrganization] Error:', error);
      toast.error(notificationCopy.title.error, error.message);
    },
  });
  
  return {
    follow: followMutation.mutate,
    followAsync: followMutation.mutateAsync,
    unfollow: unfollowMutation.mutate,
    unfollowAsync: unfollowMutation.mutateAsync,
    isFollowing: followMutation.isPending,
    isUnfollowing: unfollowMutation.isPending,
  };
}
