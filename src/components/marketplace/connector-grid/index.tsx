'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { SectionHeader } from '../asset-section/section-header';
import { Carousel, CarouselContent, CarouselItem, useCarousel } from '@/components/ui/carousel';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LogoCloud } from '@/components/ui/logo-cloud';
import { AssetCardHoverModal } from '@/components/marketplace/asset-card-hover-modal';

interface ConnectorGridProps {
  title: string;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic asset objects from multiple sources
  connectors: any[];
  viewAllHref?: string;
  className?: string;
}

/**
 * Navigation buttons for carousel
 */
function CarouselNavigation() {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();
  
  return (
    <>
      {canScrollPrev && (
        <Button
          variant="ghost"
          size="icon"
          onClick={scrollPrev}
          className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 hidden lg:flex h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border shadow-md transition-120 hover:scale-105 hover:bg-background"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">Previous slide</span>
        </Button>
      )}
      
      {canScrollNext && (
        <Button
          variant="ghost"
          size="icon"
          onClick={scrollNext}
          className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 hidden lg:flex h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border shadow-md transition-120 hover:scale-105 hover:bg-background"
        >
          <ChevronRight className="h-5 w-5" />
          <span className="sr-only">Next slide</span>
        </Button>
      )}
    </>
  );
}

/**
 * Connector Icon Component with Hover Modal
 */
function ConnectorIcon({ connector, isDark }: { connector: Record<string, unknown>; isDark: boolean }) {
  const iconRef = React.useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
  const closeTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
  const [showModal, setShowModal] = React.useState(false);
  const [iconRect, setIconRect] = React.useState<DOMRect | null>(null);
  const [_isHoveringIcon, setIsHoveringIcon] = React.useState(false);
  const [isHoveringModal, setIsHoveringModal] = React.useState(false);

  // Cleanup timeouts
  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    setIsHoveringIcon(true);
    
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    
    hoverTimeoutRef.current = setTimeout(() => {
      if (iconRef.current) {
        const rect = iconRef.current.getBoundingClientRect();
        setIconRect(rect);
        setShowModal(true);
      }
    }, 300);
  };

  const handleMouseLeave = () => {
    setIsHoveringIcon(false);
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    closeTimeoutRef.current = setTimeout(() => {
      if (!isHoveringModal) {
        setShowModal(false);
      }
    }, 100);
  };

  const handleModalMouseEnter = () => {
    setIsHoveringModal(true);
    
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
  };

  const handleModalMouseLeave = () => {
    setIsHoveringModal(false);
    setShowModal(false);
  };

  return (
    <>
      <div
        ref={iconRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <LogoCloud
          name={connector.name as string}
          iconUrl={(connector.icon_url || connector.logo_url) as string | undefined}
          iconUrlDark={connector.icon_url_dark as string | undefined}
          isDark={isDark}
          size="lg"
          showLabel
        />
      </div>

      {iconRect && (
        <AssetCardHoverModal
          show={showModal}
          asset={connector as unknown as import('@/lib/marketplace/types').UiAsset}
          cardRect={iconRect}
          onClose={() => setShowModal(false)}
          onMouseEnter={handleModalMouseEnter}
          onMouseLeave={handleModalMouseLeave}
        />
      )}
    </>
  );
}

/**
 * Connector Grid Component
 * 
 * Apple TV+ style app icons with carousel navigation
 * Displays connectors as compact brand icons with hover modals
 * 
 * Features:
 * - Square icons with rounded corners (80x80px)
 * - Logo-focused with brand colors
 * - Carousel with navigation arrows
 * - Hover modals with connector details
 * - No visible scrollbar
 */
export function ConnectorGrid({
  title,
  description: _description,
  connectors,
  viewAllHref,
  className
}: ConnectorGridProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  
  // Wait for client-side mount to avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true);
  }, []);
  
  // Deduplicate connectors by ID (in case API returns duplicates)
  const uniqueConnectors = React.useMemo(() => {
    if (!connectors || connectors.length === 0) return [];
    const seen = new Map();
    connectors.forEach(connector => {
      const key = connector.id || connector.external_id;
      if (key && !seen.has(key)) {
        seen.set(key, connector);
      }
    });
    return Array.from(seen.values());
  }, [connectors]);
  
  // Only use dark mode after mounting (avoids SSR/client mismatch)
  const isDark = mounted && resolvedTheme === 'dark';

  if (uniqueConnectors.length === 0) {
    return null;
  }

  return (
    <section className={cn('space-y-4', className)}>
      <SectionHeader 
        title={title}
        viewAllHref={viewAllHref}
      />
      <div className="relative">
        <Carousel
          opts={{
            align: 'start',
            loop: false,
            skipSnaps: false,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-3">
            {uniqueConnectors.map((connector, index) => (
              <CarouselItem 
                key={connector.id || connector.external_id || `connector-${index}`}
                className="pl-3 basis-auto"
              >
                <ConnectorIcon connector={connector} isDark={isDark} />
              </CarouselItem>
            ))}
          </CarouselContent>
          
          {/* Navigation arrows - only show if more than visible items */}
          {uniqueConnectors.length > 8 && <CarouselNavigation />}
        </Carousel>
      </div>
    </section>
  );
}
