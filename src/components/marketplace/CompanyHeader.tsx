import Image from 'next/image';
import { Organization, OrganizationStats } from '@/lib/marketplace/company';
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FollowButton } from '@/components/interactions';

interface CompanyHeaderProps {
  org: Organization;
  stats: OrganizationStats;
  isFollowing?: boolean;
  userRating?: number | null;
  ratingAvg?: number;
  ratingCount?: number;
}

export function CompanyHeader({ org, stats, isFollowing = false, userRating: _userRating = null, ratingAvg: _ratingAvg = 0, ratingCount: _ratingCount = 0 }: CompanyHeaderProps) {
  return (
    <Card className="p-8 mb-8">
      <div className="flex items-start justify-between gap-6">
        {/* Left: Logo + Info */}
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-3">
            {/* Logo */}
            {org.logo_url ? (
              <Image
                src={org.logo_url}
                alt={org.display_name}
                width={64}
                height={64}
                className="w-16 h-16 rounded-lg object-cover"
                unoptimized
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <span className="text-2xl font-bold text-primary">
                  {org.display_name.charAt(0)}
                </span>
              </div>
            )}

            {/* Name & Verified */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-3xl font-bold">{org.display_name}</h1>
                {org.verified && (
                  <Badge variant="default" className="text-xs">
                    ✓ Verified
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">@{org.slug}</p>
            </div>
          </div>

          {/* Bio */}
          {org.bio && (
            <p className="text-muted-foreground mb-4 max-w-2xl">
              {org.bio}
            </p>
          )}

          {/* Website & Socials */}
          <div className="flex items-center gap-4 text-sm">
            {org.website_url && (
              <a 
                href={org.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1"
              >
                🌐 Website
              </a>
            )}
            {org.socials?.twitter && (
              <a 
                href={`https://twitter.com/${org.socials.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1"
              >
                𝕏 Twitter
              </a>
            )}
            {org.socials?.github && (
              <a 
                href={`https://github.com/${org.socials.github}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1"
              >
                GitHub
              </a>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-col gap-3">
          <FollowButton type="org" id={org.id} initialFollowing={isFollowing} className="w-full" />
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-6 mt-6 pt-6 border-t text-sm">
        <div>
          <span className="font-semibold text-foreground">
            {stats.assets_count}
          </span>
          <span className="text-muted-foreground ml-1">Assets</span>
        </div>
        <div>
          <span className="font-semibold text-foreground">
            {stats.followers_count}
          </span>
          <span className="text-muted-foreground ml-1">Followers</span>
        </div>
      </div>

      {/* NOTE: NO contributors list per requirements */}
    </Card>
  );
}
