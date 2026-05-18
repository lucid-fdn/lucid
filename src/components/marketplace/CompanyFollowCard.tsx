'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FollowButton } from '@/components/interactions';

interface CompanyInfo {
  slug: string;
  name: string;
  logo_url?: string;
  followers_count: number;
}

interface CompanyFollowCardProps {
  slug: string;
}

export function CompanyFollowCard({ slug }: CompanyFollowCardProps) {
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const response = await fetch(`/api/company/${slug}/info`);
        if (!response.ok) throw new Error('Failed to fetch');
        
        const data = await response.json();
        setCompany(data);
      } catch (error) {
        console.error('[CompanyFollowCard] Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [slug]);

  if (loading) {
    return (
      <div className="mb-4 p-3 border rounded-lg flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-muted animate-pulse"></div>
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
          <div className="h-3 bg-muted rounded w-24 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (!company) return null;

  return (
    <div className="mb-4 p-3 border rounded-lg flex items-center gap-3">
      {/* Company Logo */}
      {company.logo_url ? (
        <Image
          src={company.logo_url}
          alt={company.name}
          width={48}
          height={48}
          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="text-lg font-bold text-primary">
            {company.name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      
      {/* Company Info */}
      <div className="flex-1 min-w-0">
        <Link href={`/company/${company.slug}`}>
          <h4 className="font-semibold hover:text-primary transition-colors duration-120">
            {company.name}
          </h4>
        </Link>
        <p className="text-sm text-muted-foreground">
          {company.followers_count.toLocaleString()} followers
        </p>
      </div>
      
      {/* Follow Button */}
      <FollowButton 
        type="org" 
        id={company.slug}
      />
    </div>
  );
}
