'use client';

import { Carousel, CarouselContent, CarouselItem, useCarousel } from '@/components/ui/carousel';
import { SectionHeader } from './section-header';
import { DashboardCard } from '../dashboard-card';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AssetSectionProps {
  title: string;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic asset objects from multiple sources
  assets: any[];
  viewAllHref?: string;
  className?: string;
  isAuthenticated?: boolean;
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
          className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border shadow-md hover:scale-105 hover:bg-background"
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
          className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border shadow-md hover:scale-105 hover:bg-background"
        >
          <ChevronRight className="h-5 w-5" />
          <span className="sr-only">Next slide</span>
        </Button>
      )}
    </>
  );
}

/**
 * Asset Section Component
 * 
 * Apple TV+ style horizontal scrolling section
 * Uses Embla Carousel for smooth scrolling
 * Follows animation standards: 120ms transitions
 * 
 * Responsive breakpoints:
 * - Mobile: 1 card visible
 * - Tablet (640px+): 2 cards visible
 * - Desktop (1024px+): 3 cards visible
 * - XL (1280px+): 4 cards visible + 30% peek of 5th (Apple TV style)
 */
export function AssetSection({
  title,
  description: _description,
  assets,
  viewAllHref,
  className,
  isAuthenticated = true
}: AssetSectionProps) {
  // Don't render if no assets
  if (!assets || assets.length === 0) {
    return null;
  }
  
  return (
    <section className={cn('space-y-4', className)}>
      <SectionHeader 
        title={title}
        viewAllHref={viewAllHref} 
      />
      
      <div className="relative group">
        <Carousel
          opts={{
            align: 'start',
            loop: false,
            skipSnaps: false,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-4">
            {assets.map((asset) => (
              <CarouselItem 
                key={asset.id}
                className="pl-4 basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-[23.26%]"
              >
                <DashboardCard asset={asset} isAuthenticated={isAuthenticated} />
              </CarouselItem>
            ))}
          </CarouselContent>
          
          {/* Navigation arrows - only show if more than 4 items */}
          {assets.length > 4 && <CarouselNavigation />}
        </Carousel>
      </div>
    </section>
  );
}
