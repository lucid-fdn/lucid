'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import type { UiAsset, DbOverlay } from '@/lib/marketplace/types';
import { Badge } from '@/components/ui/badge';
import { Heart, Bookmark, Play } from 'lucide-react';
import Image from 'next/image';
import { getProviderLogo } from '@/lib/marketplace/logo-service';
import { cn } from '@/lib/utils';

interface AssetCardHoverModalProps {
  show: boolean;
  asset: UiAsset;
  /** Position relative to hovered card */
  cardRect: DOMRect;
  /** Close modal */
  onClose: () => void;
  /** Mouse handlers to keep modal open */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Like/Bookmark handlers from parent */
  onLike?: (e: React.MouseEvent) => void;
  onBookmark?: (e: React.MouseEvent) => void;
  liked?: boolean;
  bookmarked?: boolean;
  likeCount?: number;
  bookmarkCount?: number;
  /** Hide interaction features for non-authenticated users */
  isAuthenticated?: boolean;
}

/**
 * Netflix-Style Hover Modal
 * 
 * Renders as a portal above the card on hover
 * - 200ms smooth animation (project standard)
 * - Positioned relative to hovered card
 * - Shows extended asset information
 * - Mobile: tap to open, tap outside to close
 * - Keyboard: ESC to close, focus trap
 */
export function AssetCardHoverModal({
  show,
  asset,
  cardRect,
  onClose,
  onMouseEnter,
  onMouseLeave,
  onLike,
  onBookmark,
  liked = false,
  bookmarked = false,
  likeCount = 0,
  bookmarkCount: _bookmarkCount = 0,
  isAuthenticated = true,
}: AssetCardHoverModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const overlay = asset.overlay;

  // Extended asset type with optional fields from adapters
  type ExtendedAsset = UiAsset & { icon_url?: string; logo_url?: string; metadata?: Record<string, unknown> };
  const extAsset = asset as ExtendedAsset;

  // Extended overlay type with optional marketing flags
  type ExtendedOverlay = DbOverlay & { featured?: boolean; trending?: boolean };
  const extOverlay = overlay as ExtendedOverlay | undefined;

  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to prevent immediate close from hover trigger
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Calculate modal position (Netflix-style - centered on card's center point)
  const getModalStyle = (): React.CSSProperties => {
    const margin = 24;
    // Fixed modal width for consistency across all card sizes (connectors & assets)
    const modalWidth = 420;
    
    // Get scroll position
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    
    // Calculate card center point
    const cardCenterX = cardRect.left + (cardRect.width / 2);
    const cardCenterY = cardRect.top + (cardRect.height / 2);
    
    // Center modal horizontally on card's center point
    let left = cardCenterX + scrollX - (modalWidth / 2);
    
    // Center modal vertically - position at card center
    // We'll use Framer Motion's y property to offset from this point
    let top = cardCenterY + scrollY;
    
    // Keep within viewport horizontally
    const maxLeft = scrollX + window.innerWidth - modalWidth - margin;
    if (left < scrollX + margin) left = scrollX + margin;
    if (left > maxLeft) left = maxLeft;
    
    return {
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: `${modalWidth}px`,
      maxHeight: `${modalWidth * 1.3}px`,
      zIndex: 50,
    };
  };

  const modalContent = (
      <motion.div
        key={asset.slug}
        ref={modalRef}
        className="relative bg-card rounded-lg overflow-hidden pointer-events-auto shadow-xl border border-border"
        style={getModalStyle()}
        initial={{ opacity: 0, scale: 0.9, y: '-54%' }}
        animate={{ opacity: 1, scale: 1, y: '-50%' }}
        exit={{ opacity: 0, scale: 0.9, y: '-46%' }}
        transition={{ 
          duration: 0.2,
          ease: [0.25, 0.1, 0.25, 1]
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Background Image/Video - Visible at top */}
        {(() => {
          const bannerUrl = extAsset.metadata?.banner_url;
          if (typeof bannerUrl !== 'string') return null;
          return (
            <>
              {bannerUrl.endsWith('.mp4') || bannerUrl.endsWith('.webm') ? (
                <video
                  className="absolute inset-0 w-full h-full object-cover opacity-40"
                  autoPlay
                  loop
                  muted
                  playsInline
                >
                  <source src={bannerUrl} type="video/mp4" />
                </video>
              ) : (
                <Image
                  src={bannerUrl}
                  alt={asset.name}
                  fill
                  className="absolute inset-0 w-full h-full object-cover opacity-40"
                  unoptimized
                />
              )}
            </>
          );
        })()}
        
        {/* Gradient overlay - lighter at top, darker at bottom */}
        <div className="absolute inset-0 bg-gradient-to-b from-card/40 via-card/80 to-card" />
        
        {/* Featured badge */}
        {(extOverlay?.featured || extOverlay?.trending) && (
          <Badge className="absolute top-3 left-3 bg-primary z-10">
            {extOverlay?.featured ? '⭐ Featured' : '🔥 Trending'}
          </Badge>
        )}

        {/* Content Section - Netflix Style */}
        <div className="relative p-5 overflow-y-auto" style={{ maxHeight: 'calc(100% - 2rem)' }}>
          {/* Netflix-Style Action Icons Row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {/* Play Button - Disabled with tooltip */}
              <div className="group relative">
                <button
                  disabled
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-white/30 text-black cursor-not-allowed"
                >
                  <Play className="h-5 w-5 fill-current" />
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-[100]">
                  Coming Soon
                </div>
              </div>
              
              {/* Like Button - Only show for authenticated users */}
              {isAuthenticated && (
                <button
                  onClick={onLike}
                  className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-white/30 hover:border-white transition-all duration-200"
                >
                  <Heart 
                    className={`h-4 w-4 transition-colors ${liked ? 'fill-red-500 text-red-500' : 'text-white'}`}
                  />
                </button>
              )}
              
              {/* Bookmark Button - Only show for authenticated users */}
              {isAuthenticated && (
                <button
                  onClick={onBookmark}
                  className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-white/30 hover:border-white transition-all duration-200"
                >
                  <Bookmark 
                    className={`h-4 w-4 transition-colors ${bookmarked ? 'fill-yellow-500 text-yellow-500' : 'text-white'}`}
                  />
                </button>
              )}
            </div>
            
            {/* Provider Logo - Top Right with backdrop blur */}
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white/10 backdrop-blur-sm p-2">
              {(() => {
                const assetHasOwnLogo = !!extAsset.icon_url || !!extAsset.logo_url;
                const logoUrl = getProviderLogo(asset.provider, 'color', extAsset.icon_url || extAsset.logo_url);
                // If asset has its own logo OR the returned logo is from /logos/color/, it's colored
                const isColoredLogo = assetHasOwnLogo || logoUrl.includes('/logos/color/');
                
                return (
                  <Image
                    src={logoUrl}
                    alt={asset.provider || 'Provider'}
                    width={32}
                    height={32}
                    className={cn(
                      'object-contain',
                      !isColoredLogo && 'brightness-0 invert'
                    )}
                  />
                );
              })()}
            </div>
          </div>

          {/* Title */}
          <div className="mb-3">
            <div className="flex items-start gap-2 mb-1">
              <h3 className="font-bold text-lg text-white flex-1">
                {asset.name}
              </h3>
              {isAuthenticated && asset.kind && (
                <Badge className="bg-white/10 text-white border-white/20 text-xs px-2 py-0.5">
                  {asset.kind}
                </Badge>
              )}
            </div>
          </div>

          {/* Netflix-Style Stats Row - Compact */}
          <div className="flex items-center gap-3 text-xs font-semibold mb-3">
            {likeCount > 0 && (
              <span className="text-green-500">{likeCount} Likes</span>
            )}
            {overlay?.rating_avg && (
              <span className="text-yellow-500">★ {overlay.rating_avg.toFixed(1)}</span>
            )}
            {(overlay?.proven_runs || overlay?.runs_count_30d) && (
              <span className="text-muted-foreground">
                {overlay.runs_count_30d || overlay.proven_runs} runs
              </span>
            )}
            {asset.version && (
              <span className="text-muted-foreground">v{asset.version}</span>
            )}
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            {asset.description || asset.summary || 'No description available for this asset.'}
          </p>

          {/* Tags - Compact - Only show for authenticated users */}
          {isAuthenticated && asset.tags && asset.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {asset.tags.slice(0, 8).map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded bg-white/10 text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
    </motion.div>
  );

  // Render as portal with AnimatePresence wrapper
  if (typeof window === 'undefined') return null;
  return createPortal(
    <AnimatePresence mode="wait" onExitComplete={() => console.log('[Modal] Exit animation complete')}>
      {show && modalContent}
    </AnimatePresence>,
    document.body
  );
}
