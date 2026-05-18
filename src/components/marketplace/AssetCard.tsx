'use client';

import { useState, useRef, useEffect } from 'react';
import { UiAsset } from '@/lib/marketplace/types';
import { ShineBorder } from '@/ui/components/shine-border';
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CompanyHoverCard } from './CompanyHoverCard';
import { AssetCardHoverModal } from './asset-card-hover-modal';
import { assetModalManager } from './asset-modal-manager';
import { useBookmark } from '@/hooks/use-marketplace-actions';
import { Heart, Bookmark } from 'lucide-react';

export function AssetCard({ asset }: { asset: UiAsset }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const _modalRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);
  const [_isHoveringCard, setIsHoveringCard] = useState(false);
  const [isHoveringModal, setIsHoveringModal] = useState(false);
  const overlay = asset.overlay;
  const isFeatured = overlay?.featured || overlay?.trending;
  const { bookmark: _bookmark, unbookmark: _unbookmark } = useBookmark();
  const [liked, setLiked] = useState(overlay?.liked || false);
  const [likeCount, setLikeCount] = useState(overlay?.likes_count || 0);
  
  // Debug: Log what we're actually receiving
  console.log('[AssetCard] Asset data:', {
    name: asset.name,
    kind: asset.kind,
    description: asset.description,
    summary: asset.summary,
    tags: asset.tags,
    owner_org: overlay?.owner_org,
    owner_org_slug: asset.owner_org_slug,
    provider: asset.provider
  });
  
  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Optimistic update
    const wasLiked = liked;
    const prevCount = likeCount;
    setLiked(!liked);
    setLikeCount(prev => liked ? prev - 1 : prev + 1);
    
    // Call like API
    try {
      // URL encode the ID to handle slashes in asset IDs (e.g., "hf-timm/mobilenet")
      const encodedId = encodeURIComponent(asset.external_id);
      const url = `/api/v2/marketplace/assets/${encodedId}/like`;
      console.log('[AssetCard] Calling like API:', { 
        url, 
        method: liked ? 'DELETE' : 'POST',
        assetId: asset.external_id,
        encodedId,
        assetSlug: asset.slug 
      });
      
      const response = await fetch(url, {
        method: liked ? 'DELETE' : 'POST',
        credentials: 'include',
      });
      
      // Log full response for debugging
      console.log('[AssetCard] Like API response:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });
      
      if (!response.ok) {
        const text = await response.text();
        console.log('[AssetCard] Error response body:', text);
        
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error('[AssetCard] Failed to parse error response:', e);
        }
        
        // Handle authentication errors
        if (response.status === 401) {
          throw new Error('Please sign in to like assets');
        }
        
        throw new Error(String(data.error || data.details || text || 'Failed to toggle like'));
      }
      
      const result = await response.json();
      console.log('[AssetCard] Like API success:', result);
      
      // Success - keep optimistic update
      console.log('[AssetCard] Like successful');
    } catch (error) {
      // Revert on error
      console.error('[AssetCard] Like failed:', error);
      setLiked(wasLiked);
      setLikeCount(prevCount);
      
      // Show user-friendly error
      alert(error instanceof Error ? error.message : 'Failed to like asset');
    }
  };
  
  const [bookmarked, setBookmarked] = useState(overlay?.bookmarked || false);
  const [bookmarkCount, setBookmarkCount] = useState(overlay?.bookmarks_count || 0);
  
  const handleBookmark = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Optimistic update
    const wasBookmarked = bookmarked;
    const prevCount = bookmarkCount;
    setBookmarked(!bookmarked);
    setBookmarkCount(prev => bookmarked ? prev - 1 : prev + 1);
    
    try {
      const encodedId = encodeURIComponent(asset.external_id);
      const url = `/api/v2/marketplace/assets/${encodedId}/bookmark`;
      
      const response = await fetch(url, {
        method: bookmarked ? 'DELETE' : 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle bookmark');
      }
      
      console.log('[AssetCard] Bookmark successful');
    } catch (error) {
      // Revert on error
      console.error('[AssetCard] Bookmark failed:', error);
      setBookmarked(wasBookmarked);
      setBookmarkCount(prevCount);
      alert(error instanceof Error ? error.message : 'Failed to bookmark asset');
    }
  };
  
  // Subscribe to global modal manager to ensure only ONE modal is open
  useEffect(() => {
    const unsubscribe = assetModalManager.subscribe((openAssetId: string | null) => {
      // If another asset's modal opened, close ours
      if (openAssetId !== asset.slug && showModal) {
        setShowModal(false);
      }
    });
    
    return () => {
      unsubscribe();
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      // Clean up when component unmounts
      if (showModal) {
        assetModalManager.closeModal(asset.slug);
      }
    };
  }, [asset.slug, showModal]);
  
  // Hover handlers for Netflix-style modal (300ms delay - fast & smooth)
  const handleMouseEnter = () => {
    setIsHoveringCard(true);
    
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    
    // Set timeout to show modal
    hoverTimeoutRef.current = setTimeout(() => {
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        setCardRect(rect);
        assetModalManager.openModal(asset.slug);
        setShowModal(true);
      }
    }, 300);
  };
  
  const handleMouseLeave = () => {
    setIsHoveringCard(false);
    
    // Clear pending hover timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Only close if not hovering modal - with delay for cursor transition
    closeTimeoutRef.current = setTimeout(() => {
      if (!isHoveringModal) {
        assetModalManager.closeModal(asset.slug);
        setShowModal(false);
      }
    }, 100);
  };
  
  const handleModalMouseEnter = () => {
    setIsHoveringModal(true);
    
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
  };
  
  const handleModalMouseLeave = () => {
    setIsHoveringModal(false);
    
    // Close immediately when leaving modal
    assetModalManager.closeModal(asset.slug);
    setShowModal(false);
  };
  
  const CardContent = (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
    <Card className="group relative p-5 transition-all hover:shadow-lg hover:border-primary/50">
      {/* Header - ALWAYS show kind */}
      <div className="flex items-start justify-between gap-3 mb-2" onClick={() => window.location.href = `/assets/${asset.slug}`} style={{cursor: 'pointer'}}>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg truncate group-hover:text-primary">
            {asset.name}
          </h3>
          {asset.version && (
            <p className="text-sm text-muted-foreground">
              {asset.version}
            </p>
          )}
        </div>
        {asset.kind && (
          <Badge variant={asset.kind === 'MODEL' ? 'default' : asset.kind === 'DATASET' ? 'secondary' : 'outline'}>
            {asset.kind}
          </Badge>
        )}
      </div>
      
      {/* Provider/Company - WITH HOVER CARD - Outside clickable area */}
      {(overlay?.owner_org?.name || asset.owner_org_slug || asset.provider) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <span>by</span>
          {overlay?.owner_org ? (
            <CompanyHoverCard slug={overlay.owner_org.slug}>
              <button
                className="flex items-center gap-1 text-primary hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  if (overlay?.owner_org) {
                    window.location.href = `/company/${overlay.owner_org.slug}`;
                  }
                }}
              >
                {overlay.owner_org.verified && <span className="text-blue-500">✓</span>}
                <span className="font-medium">{overlay.owner_org.name}</span>
              </button>
            </CompanyHoverCard>
          ) : asset.owner_org_slug ? (
            <CompanyHoverCard slug={asset.owner_org_slug}>
              <button
                className="text-primary hover:underline font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = `/company/${asset.owner_org_slug}`;
                }}
              >
                {asset.owner_org_slug}
              </button>
            </CompanyHoverCard>
          ) : asset.provider ? (
            <CompanyHoverCard slug={asset.provider.toLowerCase().replace(/\s+/g, '-')}>
              <button
                className="text-primary hover:underline font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  if (asset.provider) {
                    window.location.href = `/company/${asset.provider.toLowerCase().replace(/\s+/g, '-')}`;
                  }
                }}
              >
                {asset.provider}
              </button>
            </CompanyHoverCard>
          ) : null}
        </div>
      )}

      {/* Summary/Description - Show placeholder if missing */}
      <p className="text-sm text-muted-foreground line-clamp-2 mb-3 min-h-[2.5rem]" onClick={() => window.location.href = `/assets/${asset.slug}`} style={{cursor: 'pointer'}}>
        {asset.description || asset.summary || 'No description available'}
      </p>

      {/* Tags - Show placeholder if missing */}
      <div className="flex flex-wrap gap-1.5 mb-3 min-h-[1.75rem]" onClick={() => window.location.href = `/assets/${asset.slug}`} style={{cursor: 'pointer'}}>
        {asset.tags && asset.tags.length > 0 ? (
          <>
            {asset.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {asset.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{asset.tags.length - 3}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground italic">No tags</span>
        )}
      </div>

      {/* Interactive Actions - Not clickable for navigation */}
      <div className="flex items-center gap-3">
        {/* Like Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLike}
          className="flex items-center gap-1.5 h-8 px-2 hover:bg-accent"
        >
          <Heart 
            className={`w-4 h-4 transition-colors duration-120 ${liked ? 'fill-red-500 text-red-500' : 'text-muted-foreground hover:text-red-400'}`}
          />
          <span className="text-sm font-medium">
            {likeCount}
          </span>
        </Button>

        {/* Bookmark Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBookmark}
          className="flex items-center gap-1.5 h-8 px-2 hover:bg-accent"
        >
          <Bookmark 
            className={`w-4 h-4 transition-colors duration-120 ${bookmarked ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground hover:text-yellow-400'}`}
          />
          <span className="text-sm font-medium">
            {bookmarkCount}
          </span>
        </Button>

        {/* Rating */}
        {overlay?.rating_avg ? (
          <div className="flex items-center gap-1 text-sm">
            <span className="text-yellow-500">★</span>
            <span className="font-medium">{overlay.rating_avg.toFixed(1)}</span>
            {overlay.rating_count && (
              <span className="text-muted-foreground text-xs">({overlay.rating_count})</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>★</span>
            <span className="text-xs">No ratings</span>
          </div>
        )}
      </div>

      {/* Performance Metrics */}
      {((overlay?.proven_runs || overlay?.runs_count_30d) || asset.p95_ms || asset.cost_per_tok) && (
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs text-muted-foreground" onClick={() => window.location.href = `/assets/${asset.slug}`} style={{cursor: 'pointer'}}>
          {(overlay?.proven_runs || overlay?.runs_count_30d) && (
            <div>
              <span className="font-medium text-foreground">
                {overlay.runs_count_30d || overlay.proven_runs}
              </span>{' '}
              runs
            </div>
          )}

          {asset.p95_ms && (
            <div>
              <span className="font-medium text-foreground">{asset.p95_ms}ms</span> p95
            </div>
          )}

          {asset.cost_per_tok && (
            <div>
              <span className="font-medium text-foreground">
                ${(asset.cost_per_tok * 1000).toFixed(3)}
              </span>
              /1K
            </div>
          )}
        </div>
      )}

      {/* Badges */}
      {(asset.eu_only || asset.cc_on) && (
        <div className="flex gap-2" onClick={() => window.location.href = `/assets/${asset.slug}`} style={{cursor: 'pointer'}}>
          {asset.eu_only && (
            <Badge variant="secondary" className="text-xs">
              🇪🇺 EU
            </Badge>
          )}
          {asset.cc_on && (
            <Badge variant="secondary" className="text-xs">
              🔒 CC
            </Badge>
          )}
        </div>
      )}
    </Card>
    </div>
  );

  // Render modal with AnimatePresence for proper exit animations
  const modalElement = cardRect && (
    <AssetCardHoverModal
      show={showModal}
      asset={asset}
      cardRect={cardRect}
      onClose={() => {
        assetModalManager.closeModal(asset.slug);
        setShowModal(false);
      }}
      onMouseEnter={handleModalMouseEnter}
      onMouseLeave={handleModalMouseLeave}
      onLike={handleLike}
      onBookmark={handleBookmark}
      liked={liked}
      bookmarked={bookmarked}
      likeCount={likeCount}
      bookmarkCount={bookmarkCount}
    />
  );

  // Wrap featured/trending assets with shine border
  if (isFeatured) {
    return (
      <>
        <ShineBorder
          className="rounded-lg"
          color="#0B84F3"
          borderWidth={1.5}
          duration={8}
        >
          {CardContent}
        </ShineBorder>
        {modalElement}
      </>
    );
  }

  return (
    <>
      {CardContent}
      {modalElement}
    </>
  );
}
