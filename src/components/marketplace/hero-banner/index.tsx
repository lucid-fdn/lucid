import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface HeroBannerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic asset objects from multiple sources
  asset: any;
  tagline?: string;
  subtitle?: string;
  className?: string;
}

/**
 * Hero Banner Component
 * 
 * Apple TV+ style featured content banner
 * Follows animation standards: 240ms entrance
 * 
 * Displays featured asset with:
 * - Large title
 * - Subtitle/tagline
 * - Description (2 lines max)
 * - CTA buttons
 * - Gradient background
 */
export function HeroBanner({ asset, tagline, subtitle, className }: HeroBannerProps) {
  if (!asset) return null;
  
  return (
    <div 
      className={cn(
        'relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-background p-8 md:p-12 lg:p-16',
        'animate-in fade-in slide-in-from-bottom-4 duration-240',
        className
      )}
    >
      <div className="relative z-10 max-w-3xl space-y-6">
        {/* Badge */}
        <Badge variant="secondary" className="text-xs font-medium">
          {asset.kind || 'Featured'}
        </Badge>
        
        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            {asset.name}
          </h1>
          
          {tagline && (
            <p className="text-xl md:text-2xl text-muted-foreground font-medium">
              {tagline}
            </p>
          )}
        </div>
        
        {/* Subtitle or description */}
        {subtitle && (
          <p className="text-lg text-muted-foreground">
            {subtitle}
          </p>
        )}
        
        {!subtitle && asset.description && (
          <p className="text-lg text-muted-foreground line-clamp-2 max-w-2xl">
            {asset.description}
          </p>
        )}
        
        {/* CTAs */}
        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild size="lg" className="transition-120">
            <Link href={`/assets/${asset.slug || asset.id}`}>
              Try Now
            </Link>
          </Button>
          
          <Button 
            variant="outline" 
            size="lg" 
            asChild
            className="transition-120"
          >
            <Link href={`/assets/${asset.slug || asset.id}`}>
              Learn More
            </Link>
          </Button>
        </div>
      </div>
      
      {/* Background decoration */}
      <div className="absolute inset-0 bg-grid-white/10 [mask-image:radial-gradient(white,transparent_70%)]" />
      
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
    </div>
  );
}
