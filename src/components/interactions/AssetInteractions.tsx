'use client';

import { BookmarkButton } from './BookmarkButton';
import { RatingStars } from './RatingStars';

interface AssetInteractionsProps {
  assetId: string;
  initialRating?: number;
  ratingCount?: number;
  initialBookmarked?: boolean;
}

export function AssetInteractions({ 
  assetId,
  initialRating = 0,
  ratingCount = 0,
  initialBookmarked = false
}: AssetInteractionsProps) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <RatingStars
        type="asset"
        id={assetId}
        currentRating={initialRating}
        ratingCount={ratingCount}
      />
      <BookmarkButton 
        assetId={assetId}
        initialBookmarked={initialBookmarked}
      />
    </div>
  );
}
