'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { Marquee } from '@/ui/components/marquee';
import { LogoCloud } from '@/components/ui/logo-cloud';

interface ConnectorMarqueeProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts CuratedModel[], Asset[]
  recommendedConnectors: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts CuratedModel[], Asset[]
  topConnectors: any[];
  className?: string;
}

/**
 * Connector Marquee Component
 * 
 * Two-row infinite scroll marquee with connectors
 * - Top row: "Recommended for you" (AI models with videos)
 * - Bottom row: "Top connectors" (connector logos)
 * - No hover modals, just clean display
 * - Gradient fade on edges
 */
export function ConnectorMarquee({
  recommendedConnectors,
  topConnectors,
  className
}: ConnectorMarqueeProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  
  // Wait for client-side mount to avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true);
  }, []);
  
  // Only use dark mode after mounting (avoids SSR/client mismatch)
  const isDark = mounted && resolvedTheme === 'dark';

  if (!recommendedConnectors?.length || !topConnectors?.length) {
    return null;
  }

  // Check if top row has AI models or connectors
  const _hasAIModels = recommendedConnectors[0]?.kind === 'MODEL';

  return (
    <div className={cn('space-y-4', className)}>

      {/* Bottom Row - Connector Logos (scrolls opposite direction) */}
      <div className="relative">
        <Marquee reverse className="[--duration:30s] [--gap:0.75rem]">
          {topConnectors.map((connector) => (
            <LogoCloud
              key={connector.id}
              name={connector.name}
              iconUrl={connector.icon_url || connector.logo_url}
              iconUrlDark={connector.icon_url_dark}
              isDark={isDark}
              size="lg"
              showLabel
            />
          ))}
        </Marquee>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/12 bg-gradient-to-r from-background"></div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/12 bg-gradient-to-l from-background"></div>
      </div>
    </div>
  );
}
