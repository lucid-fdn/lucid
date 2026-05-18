import Link from 'next/link';
import { UiAsset } from '@/lib/marketplace/types';
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BookmarkButton, RatingStars, FollowButton, LikeButton } from '@/components/interactions';
import { CompanyHoverCard } from './CompanyHoverCard';
import { CompanyFollowCard } from './CompanyFollowCard';

interface AssetHeaderProps {
  asset: UiAsset;
  isBookmarked?: boolean;
  userRating?: number | null;
}

export function AssetHeader({ asset, isBookmarked = false, userRating = null }: AssetHeaderProps) {
  const overlay = asset.overlay;

  return (
    <Card className="p-6 mb-6">
      {/* Title & Actions Bar */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-2">{asset.name}</h1>
          <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline">{asset.version}</Badge>
          <Badge>{asset.kind}</Badge>
          
          {/* Owner Chip - For header reference only */}
          {asset.owner_org_slug ? (
            <CompanyHoverCard slug={asset.owner_org_slug}>
              <Link 
                href={`/company/${asset.owner_org_slug}`}
                className="text-sm text-primary hover:underline font-medium"
              >
                by {asset.owner_org_slug}
              </Link>
            </CompanyHoverCard>
          ) : asset.owner_user_handle ? (
            <Link 
              href={`/contributor/${asset.owner_user_handle}`}
              className="text-sm text-primary hover:underline font-medium"
            >
              by @{asset.owner_user_handle}
            </Link>
          ) : null}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <LikeButton 
            assetId={overlay?.asset_row_id || asset.external_id}
            variant="icon"
          />
          
          <BookmarkButton 
            assetId={overlay?.asset_row_id || asset.external_id} 
            initialBookmarked={isBookmarked}
          />
        </div>
      </div>
      
      {/* Company/Creator Follow Card */}
      {asset.owner_org_slug && (
        <CompanyFollowCard slug={asset.owner_org_slug} />
      )}
      {asset.owner_user_handle && !asset.owner_org_slug && (
        <div className="mb-4 p-3 border rounded-lg flex items-center gap-3">
          <div className="flex-1">
            <Link href={`/contributor/${asset.owner_user_handle}`}>
              <h4 className="font-semibold hover:text-primary">
                @{asset.owner_user_handle}
              </h4>
            </Link>
            <p className="text-sm text-muted-foreground">Contributor</p>
          </div>
          <FollowButton 
            type="contributor" 
            id={asset.owner_user_handle}
          />
        </div>
      )}
      
      {/* Rating Stars */}
      {overlay?.asset_row_id && (
        <div className="mb-4">
          <RatingStars
            type="asset"
            id={overlay.asset_row_id}
            currentRating={overlay?.rating_avg}
            ratingCount={overlay?.rating_count}
            userRating={userRating}
          />
        </div>
      )}

      {/* Summary */}
      {asset.summary && (
        <p className="text-muted-foreground mb-4">{asset.summary}</p>
      )}

      {/* Tags */}
      {asset.tags && asset.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {asset.tags.map(tag => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
        {/* Rating */}
        {overlay?.rating_avg && (
          <div>
            <div className="text-sm text-muted-foreground">Rating</div>
            <div className="flex items-center gap-1">
              <span className="text-yellow-500">★</span>
              <span className="font-semibold">{overlay.rating_avg.toFixed(1)}</span>
              {overlay.rating_count && (
                <span className="text-sm text-muted-foreground">
                  ({overlay.rating_count})
                </span>
              )}
            </div>
          </div>
        )}

        {/* Runs */}
        {(overlay?.runs_count_30d || overlay?.proven_runs) && (
          <div>
            <div className="text-sm text-muted-foreground">Runs (30d)</div>
            <div className="font-semibold">
              {(overlay.runs_count_30d || overlay.proven_runs || 0).toLocaleString()}
            </div>
          </div>
        )}

        {/* P95 Latency */}
        {asset.p95_ms && (
          <div>
            <div className="text-sm text-muted-foreground">P95 Latency</div>
            <div className="font-semibold">{asset.p95_ms}ms</div>
          </div>
        )}

        {/* Cost */}
        {asset.cost_per_tok && (
          <div>
            <div className="text-sm text-muted-foreground">Cost per 1K</div>
            <div className="font-semibold">
              ${(asset.cost_per_tok * 1000).toFixed(4)}
            </div>
          </div>
        )}

        {/* Reliability */}
        {overlay?.reliability && (
          <div>
            <div className="text-sm text-muted-foreground">Reliability</div>
            <div className="font-semibold">{overlay.reliability}%</div>
          </div>
        )}

        {/* License */}
        {asset.license && (
          <div>
            <div className="text-sm text-muted-foreground">License</div>
            <div className="font-semibold text-sm">{asset.license}</div>
          </div>
        )}
      </div>

      {/* Badges Row */}
      <div className="flex gap-2 mt-4 pt-4 border-t">
        {asset.eu_only && (
          <Badge variant="secondary" className="text-xs">
            🇪🇺 EU Only
          </Badge>
        )}
        {asset.cc_on && (
          <Badge variant="secondary" className="text-xs">
            🔒 Confidential Compute
          </Badge>
        )}
      </div>
    </Card>
  );
}
