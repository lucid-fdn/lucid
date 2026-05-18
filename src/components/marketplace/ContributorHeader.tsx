import { Contributor } from '@/lib/marketplace/contributor';
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FollowButton } from '@/components/interactions';

interface ContributorHeaderProps {
  contributor: Contributor;
  assetCount: number;
  isFollowing?: boolean;
  userRating?: number | null;
  ratingAvg?: number;
  ratingCount?: number;
}

export function ContributorHeader({ 
  contributor, 
  assetCount,
  isFollowing = false,
  userRating: _userRating = null,
  ratingAvg: _ratingAvg = 0,
  ratingCount: _ratingCount = 0
}: ContributorHeaderProps) {
  const initials = contributor.name 
    ? contributor.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : contributor.handle.slice(0, 2).toUpperCase();

  return (
    <Card className="p-8 mb-8">
      <div className="flex items-start justify-between gap-6">
        {/* Left: Avatar + Info */}
        <div className="flex items-center gap-4 flex-1">
          {/* Avatar */}
          <Avatar className="w-20 h-20">
            {contributor.avatar_url && (
              <AvatarImage src={contributor.avatar_url} alt={contributor.handle} />
            )}
            <AvatarFallback className="text-lg font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* Name & Handle */}
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-1">
              {contributor.name || contributor.handle}
            </h1>
            <p className="text-sm text-muted-foreground mb-2">
              @{contributor.handle}
            </p>

            {/* Bio */}
            {contributor.bio && (
              <p className="text-sm text-muted-foreground max-w-xl">
                {contributor.bio}
              </p>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-col gap-3">
          <FollowButton 
            type="contributor" 
            id={contributor.handle} 
            initialFollowing={isFollowing}
            className="w-full"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-6 mt-6 pt-6 border-t text-sm">
        <div>
          <span className="font-semibold text-foreground">
            {assetCount}
          </span>
          <span className="text-muted-foreground ml-1">
            Personal Asset{assetCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Note: Only personal assets (no company) */}
      <p className="text-xs text-muted-foreground mt-2">
        Showing assets owned directly by this contributor (excludes company assets)
      </p>
    </Card>
  );
}
