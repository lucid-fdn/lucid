'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CommandGroup, CommandItem } from '@/components/ui/command';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import { CpuChipIcon, CircleStackIcon, RocketLaunchIcon, PuzzlePieceIcon } from '@heroicons/react/24/outline';
import { SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import type { SearchResult } from '@/lib/search/adapters/base';

interface MarketplaceCommandGroupProps {
  search: string;
}

/**
 * Skeleton Loader - Apple-style loading state
 */
function SearchSkeleton() {
  return (
    <CommandGroup heading="Searching...">
      {[1, 2, 3].map((i) => (
        <CommandItem 
          key={`skeleton-${i}`}
          forceMount
          disabled
        >
          <div className="flex items-center gap-3 w-full py-1">
            <Skeleton className="h-4 w-4 rounded" />
            <div className="flex flex-col flex-1 gap-2">
              <Skeleton className="h-4 w-[60%]" />
              <Skeleton className="h-3 w-[40%]" />
            </div>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/**
 * Popular Searches - Show when user starts typing
 */
function PopularSearches() {
  const _router = useRouter();
  const popularSearches = [
    { query: 'gpt', label: 'GPT Models', icon: CpuChipIcon },
    { query: 'image generation', label: 'Image Generation', icon: SparklesIcon },
    { query: 'video', label: 'Video Models', icon: RocketLaunchIcon },
    { query: 'dataset', label: 'Datasets', icon: CircleStackIcon },
  ];

  return (
    <CommandGroup heading="💡 Popular Searches">
      {popularSearches.map((item) => {
        const Icon = item.icon;
        return (
          <CommandItem
            key={item.query}
            value={item.query}
            onSelect={() => {
              // Trigger search by setting the command input value
              const input = document.querySelector('[cmdk-input]') as HTMLInputElement;
              if (input) {
                input.value = item.query;
                input.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }}
            className="flex items-center gap-3 px-3 py-2"
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{item.label}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              Search →
            </span>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

/**
 * Empty State - When no results found
 */
function EmptyState({ searchQuery }: { searchQuery: string }) {
  return (
    <CommandGroup heading="No results">
      <CommandItem forceMount disabled>
        <div className="px-3 py-6 text-center w-full">
          <p className="text-sm text-muted-foreground mb-3">
            No results found for <span className="font-medium text-foreground">"{searchQuery}"</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Try different keywords or browse our marketplace
          </p>
        </div>
      </CommandItem>
    </CommandGroup>
  );
}

/**
 * Error State - When API fails with retry
 */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <CommandGroup heading="Error">
      <CommandItem
        onSelect={onRetry}
        className="flex items-center gap-3 px-3 py-2"
      >
        <ArrowPathIcon className="h-4 w-4 text-amber-500" />
        <div className="flex flex-col flex-1">
          <span className="font-medium">Failed to search marketplace</span>
          <span className="text-xs text-muted-foreground">
            Click to retry or try again later
          </span>
        </div>
      </CommandItem>
    </CommandGroup>
  );
}

export function MarketplaceCommandGroup({ search }: MarketplaceCommandGroupProps) {
  const router = useRouter();
  
  // Debounce search to reduce API calls (wait 300ms after user stops typing)
  const [debouncedSearch, setDebouncedSearch] = React.useState(search);
  
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300); // 300ms debounce - industry standard
    
    return () => clearTimeout(timer);
  }, [search]);
  
  // Only search if there's a query
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['command-palette-search', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return { results: [] };
      
      const params = new URLSearchParams({
        q: search,
        limit: '6', // Show top 6 in command palette
      });
      
      const response = await fetch(`/api/v2/marketplace/search?${params}`);
      if (!response.ok) throw new Error('Search failed');
      
      const result = await response.json();
      return result.success ? result.data : { results: [] };
    },
    enabled: search.length >= 2,
    staleTime: 30000, // 30s cache
    retry: 1, // Retry once on failure
  });
  
  const results = data?.results || [];
  const total = data?.total || 0;
  
  // DEBUG: Log all states
  console.log('[MarketplaceCommandGroup]', {
    search,
    isLoading,
    isFetching,
    hasData: !!data,
    resultsCount: results.length,
    error: !!error,
  });
  
  // Show popular searches when user just started typing (1 char)
  if (search.length === 1) {
    console.log('[MarketplaceCommandGroup] Showing popular searches');
    return <PopularSearches />;
  }
  
  // Don't render if no search query
  if (!search || search.length < 2) {
    console.log('[MarketplaceCommandGroup] No search query, returning null');
    return null;
  }
  
  // Error state with retry
  if (error && !isFetching) {
    console.log('[MarketplaceCommandGroup] Showing error state');
    return <ErrorState onRetry={() => refetch()} />;
  }
  
  // Loading state - Apple-style skeletons
  // Use isFetching instead of isLoading to show skeleton on EVERY search (not just first)
  if (isFetching) {
    console.log('[MarketplaceCommandGroup] Showing skeleton (isFetching=true)');
    return <SearchSkeleton />;
  }
  
  // Empty state
  if (results.length === 0) {
    console.log('[MarketplaceCommandGroup] Showing empty state');
    return <EmptyState searchQuery={search} />;
  }
  
  console.log('[MarketplaceCommandGroup] Showing results:', results.length);
  
  // DEBUG: Log first result to see what data we have
  if (results.length > 0) {
    console.log('[MarketplaceCommandGroup] First result data:', {
      name: results[0].name,
      icon_url: results[0].icon_url,
      logo_url: results[0].logo_url,
      metadata: results[0].metadata,
      allKeys: Object.keys(results[0]),
      // Check if avatar_url is in metadata
      metadata_keys: results[0].metadata ? Object.keys(results[0].metadata) : [],
      metadata_avatar: results[0].metadata?.avatar_url,
      metadata_icon: results[0].metadata?.icon_url
    });
  }
  
  return (
    <CommandGroup heading={`Marketplace Assets (${results.length}${total > results.length ? `/${total}` : ''})`}>
      {results.map((result: SearchResult) => {
        // Check if asset has logo/icon
        const hasLogo = result.icon_url || result.logo_url || result.metadata?.icon_url || result.metadata?.avatar_url;
        const logoUrl = (result.icon_url || result.logo_url || result.metadata?.icon_url || result.metadata?.avatar_url) as string | undefined;
        
        // DEBUG: Log logo check for each result
        console.log(`[Logo] ${result.name}:`, {
          hasLogo,
          logoUrl,
          icon_url: result.icon_url,
          logo_url: result.logo_url,
          metadata_icon: result.metadata?.icon_url,
          metadata_avatar: result.metadata?.avatar_url
        });
        
        // Fallback icon for assets without logos
        const getFallbackIcon = (kind: string) => {
          switch (kind) {
            case 'MODEL': return CpuChipIcon;
            case 'DATASET': return CircleStackIcon;
            case 'CONNECTOR': return PuzzlePieceIcon;
            case 'AGENT':
            case 'APP': return RocketLaunchIcon;
            default: return CpuChipIcon;
          }
        };
        
        const FallbackIcon = getFallbackIcon(result.type);
        
        return (
          <CommandItem
            key={result.external_id}
            value={`${result.name} ${result.description || ''} marketplace ${result.type}`}
            onSelect={() => router.push(`/assets/${result.metadata?.slug || result.external_id}`)}
            className="flex items-center gap-3 px-3 py-2 transition-all duration-120"
          >
            {/* Show logo if available, otherwise fallback icon */}
            {hasLogo ? (
              <Image
                src={logoUrl!}
                alt={result.name}
                width={20}
                height={20}
                className="h-5 w-5 rounded object-contain flex-shrink-0"
                onError={(e) => {
                  // If image fails to load, hide it and show fallback
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'block';
                }}
              />
            ) : null}
            {/* Fallback icon (hidden if logo loads successfully) */}
            <FallbackIcon 
              className={`h-4 w-4 text-muted-foreground flex-shrink-0 ${hasLogo ? 'hidden' : ''}`} 
            />
            
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-medium truncate">{result.name}</span>
              <span className="text-xs text-muted-foreground truncate">
                {result.type} • {result.provider || 'Unknown'}
              </span>
            </div>
            <span className="text-xs text-muted-foreground/50 ml-auto">↵</span>
          </CommandItem>
        );
      })}
      
      {/* Show "View all results" if there are more */}
      {total > results.length && (
        <CommandItem
          value={`view all ${search} results`}
          onSelect={() => router.push(`/explore?q=${encodeURIComponent(search)}`)}
          className="flex items-center gap-3 px-3 py-2 border-t mt-1 font-medium text-primary"
        >
          <SparklesIcon className="h-4 w-4" />
          <span>View all {total} results in marketplace</span>
          <span className="text-xs text-muted-foreground ml-auto">⌘K</span>
        </CommandItem>
      )}
    </CommandGroup>
  );
}
