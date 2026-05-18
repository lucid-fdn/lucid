'use client';

import { useState } from 'react';
import { HeartIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';

interface LikeButtonProps {
  assetId: string;
  initialLiked?: boolean;
  initialLikeCount?: number;
  variant?: 'default' | 'icon';
}

export function LikeButton({ 
  assetId, 
  initialLiked = false,
  initialLikeCount = 0,
  variant = 'default'
}: LikeButtonProps) {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in to like assets');
      return;
    }

    // Optimistic update
    const previousState = isLiked;
    const previousCount = likeCount;
    
    setIsLiked(!isLiked);
    setLikeCount(prev => isLiked ? Math.max(0, prev - 1) : prev + 1);
    setIsLoading(true);

    try {
      const method = isLiked ? 'DELETE' : 'POST';
      const response = await fetch(`/api/(studio)/like/${assetId}`, {
        method,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to toggle like');
      }

      const data = await response.json();
      
      // Update with actual count from server
      if (data.likeCount !== undefined) {
        setLikeCount(data.likeCount);
      }

      toast.success(isLiked ? 'Removed like' : 'Liked!');
    } catch (error) {
      // Revert on error
      setIsLiked(previousState);
      setLikeCount(previousCount);
      toast.error('Failed to update like');
      console.error('[LikeButton] Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (variant === 'icon') {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        disabled={isLoading}
        className="hover:text-red-500"
        title={isLiked ? 'Unlike' : 'Like'}
      >
        {isLiked ? (
          <HeartSolid className="h-5 w-5 text-red-500" />
        ) : (
          <HeartIcon className="h-5 w-5" />
        )}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={isLoading}
      className="gap-2"
    >
      {isLiked ? (
        <HeartSolid className="h-4 w-4 text-red-500" />
      ) : (
        <HeartIcon className="h-4 w-4" />
      )}
      <span>{likeCount > 0 ? likeCount.toLocaleString() : 'Like'}</span>
    </Button>
  );
}
