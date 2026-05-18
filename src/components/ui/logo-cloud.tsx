'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Brand Colors Database
 * Maps connector names to their official brand colors
 */
const BRAND_COLORS: Record<string, { light: string; dark: string }> = {
  // Web3/Crypto
  'hyperliquid': { light: 'bg-[#072723]', dark: 'bg-[#072723]' },
  'polymarket': { light: 'bg-[#1652F0]', dark: 'bg-[#1652F0]' },
  'solana': { light: 'bg-[#072723]', dark: 'bg-[#072723]' },
  'pumpfun': { light: 'bg-[#1A1C27]', dark: 'bg-[#1A1C27]' },
  'metamask': { light: 'bg-white', dark: 'bg-white' },
  'phantom': { light: 'bg-[#ACA0F2]', dark: 'bg-[#ACA0F2]' },
  'jupiter': { light: 'bg-[#31313A]', dark: 'bg-[#31313A]' },
  'wormhole': { light: 'bg-[#7168BE]', dark: 'bg-[#7168BE]' },
  'meteora': { light: 'bg-[#1B223D]', dark: 'bg-[#1B223D]' },
  'apechain': { light: 'bg-[#084CD1]', dark: 'bg-[#084CD1]' },
  
  // Traditional SaaS
  'telegram': { light: 'bg-[#37AEE2]', dark: 'bg-[#37AEE2]' },
  'discord': { light: 'bg-white', dark: 'bg-white' },
  'x': { light: 'bg-[#22262A]', dark: 'bg-[#22262A]' },
  'twitter': { light: 'bg-[#22262A]', dark: 'bg-[#22262A]' },
  'airtable': { light: 'bg-white', dark: 'bg-white' },
  'notion': { light: 'bg-white', dark: 'bg-[#22262A]' },
  'slack': { light: 'bg-[#501C51]', dark: 'bg-[#501C51]' },
  'google sheets': { light: 'bg-white', dark: 'bg-white' },
  'google': { light: 'bg-blue-50', dark: 'bg-blue-950/30' },
  'github': { light: 'bg-[#22262A]', dark: 'bg-[#22262A]' },
  'stripe': { light: 'bg-white', dark: 'bg-white' },
  'sendgrid': { light: 'bg-blue-50', dark: 'bg-blue-950/30' },
  'twilio': { light: 'bg-red-50', dark: 'bg-red-950/30' },
  'figma': { light: 'bg-[#072723]', dark: 'bg-purple-950/30' },
  'shopify': { light: 'bg-green-50', dark: 'bg-green-950/30' },
  'mailchimp': { light: 'bg-yellow-50', dark: 'bg-yellow-950/30' },
  'asana': { light: 'bg-pink-50', dark: 'bg-pink-950/30' },
  'trello': { light: 'bg-blue-50', dark: 'bg-blue-950/30' },
  'hubspot': { light: 'bg-orange-50', dark: 'bg-orange-950/30' },
  'salesforce': { light: 'bg-blue-50', dark: 'bg-blue-950/30' },
  'zoom': { light: 'bg-blue-50', dark: 'bg-blue-950/30' },
  'dropbox': { light: 'bg-blue-50', dark: 'bg-blue-950/30' },
  'linkedin': { light: 'bg-blue-50', dark: 'bg-blue-950/30' },
};

/**
 * Get brand-compatible background color for a service
 */
function getBrandColor(name: string, isDark: boolean): string {
  const lowerName = name.toLowerCase();
  
  // Find matching brand color
  for (const [brand, colors] of Object.entries(BRAND_COLORS)) {
    if (lowerName.includes(brand)) {
      return isDark ? colors.dark : colors.light;
    }
  }
  
  // Default fallback
  return isDark ? 'bg-muted/30' : 'bg-muted/50';
}

export interface LogoCloudProps {
  /** Service/connector name (e.g., "Telegram", "Stripe") */
  name: string;
  /** Icon URL */
  iconUrl?: string;
  /** Dark icon URL (optional) */
  iconUrlDark?: string;
  /** Whether dark mode is active */
  isDark?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Show name label on hover */
  showLabel?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

const SIZE_CLASSES = {
  sm: 'w-12 h-12 p-2',
  md: 'w-16 h-16 p-2.5',
  lg: 'w-20 h-20 p-3',
  xl: 'w-24 h-24 p-4',
};

/**
 * LogoCloud Component
 * 
 * Reusable component for displaying service/connector logos
 * with brand-appropriate background colors
 * 
 * @example
 * ```tsx
 * <LogoCloud 
 *   name="Telegram" 
 *   iconUrl="/logos/telegram.svg"
 *   size="md"
 *   showLabel
 * />
 * ```
 */
export function LogoCloud({
  name,
  iconUrl,
  iconUrlDark,
  isDark = false,
  size = 'lg',
  showLabel = false,
  className,
  onClick,
}: LogoCloudProps) {
  // Select appropriate icon based on theme
  const selectedIcon = isDark 
    ? (iconUrlDark || iconUrl)
    : iconUrl;
  
  // Get brand background color
  const brandBgColor = getBrandColor(name, isDark);
  
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex-shrink-0',
        SIZE_CLASSES[size],
        'rounded-lg overflow-hidden',
        brandBgColor,
        'transition-all hover:shadow-lg',
        'flex items-center justify-center',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {/* Icon or Initials */}
      <div className="w-full h-full flex items-center justify-center relative">
        {selectedIcon ? (
          <Image 
            src={selectedIcon} 
            alt={name}
            fill
            className="object-contain"
            onError={(e) => {
              // Hide image and show fallback
              const target = e.currentTarget;
              target.style.display = 'none';
              const fallback = target.parentElement?.querySelector('.fallback-icon');
              if (fallback) {
                (fallback as HTMLElement).style.display = 'flex';
              }
            }}
          />
        ) : null}
        
        {/* Fallback: First 2 letters */}
        <div 
          className="fallback-icon text-xl font-bold text-foreground/80"
          style={{ display: selectedIcon ? 'none' : 'flex' }}
        >
          {name.substring(0, 2).toUpperCase()}
        </div>
      </div>

      {/* Hover Label */}
      {showLabel && (
        <div className={cn(
          'absolute -bottom-8 left-1/2 -translate-x-1/2',
          'px-2 py-1 rounded bg-popover border shadow-md',
          'text-xs text-popover-foreground whitespace-nowrap',
          'opacity-0 group-hover:opacity-100 transition-120',
          'pointer-events-none z-10'
        )}>
          {name}
        </div>
      )}
    </div>
  );
}

/**
 * LogoCloudGrid Component
 * 
 * Display multiple logos in a grid layout
 * 
 * @example
 * ```tsx
 * <LogoCloudGrid>
 *   <LogoCloud name="Telegram" iconUrl="..." />
 *   <LogoCloud name="Slack" iconUrl="..." />
 * </LogoCloudGrid>
 * ```
 */
export function LogoCloudGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      'grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4',
      className
    )}>
      {children}
    </div>
  );
}
