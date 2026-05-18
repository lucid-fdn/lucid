'use client';

import { useState } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useRating } from '@/hooks/use-marketplace-actions';

interface RatingStarsProps {
  type: 'asset' | 'org' | 'contributor';
  id: string;
  currentRating?: number;
  ratingCount?: number;
  userRating?: number | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function RatingStars({
  type,
  id,
  currentRating = 0,
  ratingCount = 0,
  userRating: initialUserRating = null,
  className = '',
  size = 'md',
}: RatingStarsProps) {
  const [userRating, setUserRating] = useState<number | null>(initialUserRating);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  
  // Use v2 hook for assets only
  const { rate: rateAsset, isRating } = useRating();

  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const handleRate = (score: number) => {
    if (isRating) return;
    
    // Optimistic update
    setUserRating(score);
    
    // Use v2 hook for assets
    if (type === 'asset') {
      rateAsset({ assetId: id, score });
    }
    // TODO: Add v2 support for org/contributor ratings
  };

  const displayRating = hoverRating || userRating || 0;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRate(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(null)}
            disabled={isRating}
            className="cursor-pointer disabled:cursor-not-allowed transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                sizeClasses[size],
                'transition-colors duration-120',
                star <= displayRating
                  ? 'fill-yellow-500 stroke-yellow-500'
                  : star <= currentRating
                  ? 'fill-gray-300 stroke-gray-300'
                  : 'fill-none stroke-gray-300'
              )}
            />
          </button>
        ))}
      </div>
      
      {isRating && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      
      {currentRating > 0 && (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">{currentRating.toFixed(1)}</span>
          {ratingCount > 0 && <span className="ml-1">({ratingCount})</span>}
        </div>
      )}
      
      {userRating && (
        <span className="text-xs text-primary">Your rating: {userRating}</span>
      )}
    </div>
  );
}
