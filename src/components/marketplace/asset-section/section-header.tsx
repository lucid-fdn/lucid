import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface SectionHeaderProps {
  title: string;
  description?: string;
  viewAllHref?: string;
}

/**
 * Section Header Component
 * 
 * Apple TV+ style section title with optional "See All" link
 * Follows animation standards: 120ms transitions
 */
export function SectionHeader({ title, description, viewAllHref }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-120"
        >
          See All
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
