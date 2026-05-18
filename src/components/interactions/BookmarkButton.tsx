'use client';

import { useState } from 'react';
import { BookmarkIcon as BookmarkOutline } from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolid } from '@heroicons/react/24/solid';
import { Button } from "@/components/ui/button";
import { useBookmark } from '@/hooks/use-marketplace-actions';

interface BookmarkButtonProps {
  assetId: string;
  initialBookmarked?: boolean;
}

export function BookmarkButton({ assetId, initialBookmarked = false }: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(initialBookmarked);
  const { bookmark, unbookmark, isBookmarking, isUnbookmarking } = useBookmark();

  const handleToggle = () => {
    // Optimistic update
    setIsBookmarked(!isBookmarked);
    
    if (isBookmarked) {
      unbookmark({ assetId });
    } else {
      bookmark({ assetId });
    }
  };

  const isLoading = isBookmarking || isUnbookmarking;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={isLoading}
      className="gap-2"
    >
      {isBookmarked ? (
        <BookmarkSolid className="h-5 w-5 text-primary" />
      ) : (
        <BookmarkOutline className="h-5 w-5" />
      )}
      <span>{isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
    </Button>
  );
}
