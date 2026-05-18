'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import Image from 'next/image';
import { FollowButton } from '@/components/interactions/FollowButton';
import { Badge } from "@/components/ui/badge";

interface CompanyInfo {
  id: string;
  slug: string;
  name: string;
  logo_url?: string;
  description?: string;
  followers_count: number;
  assets_count: number;
  verified?: boolean;
  following?: boolean;
}

interface CompanyHoverCardProps {
  slug: string;
  children: React.ReactNode;
}

export function CompanyHoverCard({ slug, children }: CompanyHoverCardProps) {
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchCompanyInfo = async () => {
    if (company) return; // Already loaded
    
    setLoading(true);
    try {
      // Fetch company info (404s expected for external providers like HuggingFace)
      const response = await fetch(`/api/company/${slug}/info`, {
        // Suppress 404 errors in console
        ...({} as RequestInit)
      });
      
      let data;
      if (!response.ok) {
        // Company not in database yet, use slug-based fallback (expected for external providers)
        data = {
          id: slug, // Use slug as ID for follow API
          slug: slug,
          name: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '),
          logo_url: null,
          description: null,
          followers_count: 0,
          assets_count: 0,
          verified: false,
          following: false
        };
      } else {
        data = await response.json();
      }
      
      // Fetch follow status
      try {
        const followResponse = await fetch(`/api/v2/marketplace/organizations/${data.id}/follow`);
        if (followResponse.ok) {
          const followData = await followResponse.json();
          data.following = followData.data?.following || false;
        }
      } catch (_err) {
        // Ignore follow status errors, default to not following
        data.following = false;
      }
      
      setCompany(data);
    } catch (err) {
      console.error('[CompanyHoverCard] Error:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild onMouseEnter={fetchCompanyInfo}>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80" align="start">
        {loading && (
          <div className="flex items-center justify-center p-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        )}
        
        {error && (
          <div className="text-sm text-muted-foreground p-4">
            Failed to load company info
          </div>
        )}
        
        {company && (
          <div className="flex gap-3">
            {/* Logo */}
            {company.logo_url ? (
              <Image
                src={company.logo_url}
                alt={company.name}
                width={48}
                height={48}
                className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                unoptimized
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-primary">
                  {company.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            
            {/* Info */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <Link href={`/company/${company.slug}`}>
                  <h4 className="font-semibold hover:text-primary transition-colors duration-120">
                    {company.name}
                  </h4>
                </Link>
                {company.verified && (
                  <Badge variant="default" className="text-xs h-5">
                    ✓
                  </Badge>
                )}
              </div>
              
              {company.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {company.description}
                </p>
              )}
              
              <div className="flex items-center justify-between pt-1">
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">
                      {company.assets_count}
                    </span>{' '}
                    assets
                  </span>
                  <span>
                    <span className="font-medium text-foreground">
                      {company.followers_count}
                    </span>{' '}
                    followers
                  </span>
                </div>
                <FollowButton 
                  type="org" 
                  id={company.id}
                  initialFollowing={company.following}
                  className="h-7 text-xs"
                />
              </div>
            </div>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
