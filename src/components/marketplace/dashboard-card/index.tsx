'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getProviderLogo } from '@/lib/marketplace/logo-service';
import { AssetCardHoverModal } from '@/components/marketplace/asset-card-hover-modal';
import { assetModalManager } from '@/components/marketplace/asset-modal-manager';

interface DashboardCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic asset objects from multiple sources
  asset: any;
  className?: string;
  cloneIndex?: number;
  isAuthenticated?: boolean;
}

/**
 * Dashboard Card Component
 * 
 * Netflix-style horizontal card with hover modal
 * - 16:9 aspect ratio
 * - 300ms hover delay before modal appears
 * - Modal shows extended content
 * - Gradient overlay for text readability
 */
export function DashboardCard({ asset, className, cloneIndex = 0, isAuthenticated = true }: DashboardCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const closeTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [showModal, setShowModal] = useState(false);
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);
  const [_isHoveringCard, setIsHoveringCard] = useState(false);
  const [isHoveringModal, setIsHoveringModal] = useState(false);
  const [_isVideoVisible, _setIsVideoVisible] = useState(false);
  
  // Get provider logo (bundled SVG color) with fallback to asset icon
  const logoUrl = getProviderLogo(
    asset.provider,
    'color',
    asset.icon_url || asset.logo_url
  );
  
  // Check if logo is colored or needs white filter
  const isColoredLogo = logoUrl.includes('/logos/color/');
  
  // Get background from metadata
  const backgroundUrl = asset.metadata?.banner_url;
  
  // Simple video autoplay on mount
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    // Attempt to play video
    const playPromise = video.play();
    
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('[DashboardCard] Video playing:', backgroundUrl);
        })
        .catch((error) => {
          console.log('[DashboardCard] Autoplay blocked:', error.message);
        });
    }
  }, [backgroundUrl]);
  
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
  
  // Hover handlers for Netflix-style modal (300ms delay)
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
  
  const handleCardClick = () => {
    // Disabled - Coming Soon
    // window.location.href = `/assets/${asset.slug || asset.id}`;
  };
  
  return (
    <>
      <div
        ref={cardRef}
        onClick={handleCardClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'group relative rounded-lg',
          'transition-all duration-300 ease-out',
          className
        )}
      >
        {/* Card Container - Netflix 16:9 Aspect Ratio */}
        <div className="relative aspect-video rounded-lg">
          {/* Background Image/Video */}
          {backgroundUrl && (
            <>
              {backgroundUrl.endsWith('.mp4') || backgroundUrl.endsWith('.webm') ? (
                <video
                  ref={videoRef}
                  key={`${backgroundUrl}-${cloneIndex}`}
                  className="absolute inset-0 w-full h-full object-cover rounded-lg"
                  autoPlay={cloneIndex === 0}
                  loop
                  muted
                  playsInline
                  preload={cloneIndex === 0 ? "auto" : "none"}
                  onLoadStart={() => {
                    console.log('[DashboardCard] Video starting to load:', backgroundUrl);
                  }}
                  onError={(e) => {
                    console.error('[DashboardCard] Video error:', backgroundUrl, e);
                  }}
                  onLoadedData={() => {
                    console.log('[DashboardCard] Video loaded successfully:', backgroundUrl);
                  }}
                  onCanPlay={() => {
                    console.log('[DashboardCard] Video can play:', backgroundUrl);
                  }}
                >
                  <source 
                    src={backgroundUrl} 
                    type={backgroundUrl.endsWith('.webm') ? 'video/webm' : 'video/mp4'} 
                  />
                </video>
              ) : (
                <Image
                  src={backgroundUrl}
                  alt={asset.name}
                  fill
                  className="object-cover rounded-lg"
                />
              )}
            </>
          )}
          
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/100 via-black/70 to-black/30 rounded-lg" />
          
          {/* Icon Badge - Top Left */}
          <div className="absolute top-4 left-4 w-12 h-12 rounded-lg bg-white/10 backdrop-blur-sm p-2 flex items-center justify-center">
            <Image
              src={logoUrl}
              alt={asset.provider || asset.name}
              width={32}
              height={32}
              className={cn(
                'object-contain',
                !isColoredLogo && 'brightness-0 invert'
              )}
              onError={(e) => {
                const fallback = asset.icon_url || asset.logo_url;
                if (fallback && e.currentTarget.src !== fallback) {
                  e.currentTarget.src = fallback;
                }
              }}
            />
          </div>
          
          {/* Content - Bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
            {/* Title */}
            <h3 className="text-lg font-semibold text-white line-clamp-1">
              {asset.name}
            </h3>
            
            {/* Description */}
            {asset.description && (
              <p className="text-sm text-white/80 line-clamp-2">
                {asset.description}
              </p>
            )}
          </div>
          
        </div>
      </div>
      
      {/* Netflix-Style Hover Modal */}
      {cardRect && (
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
          isAuthenticated={isAuthenticated}
        />
      )}
    </>
  );
}
