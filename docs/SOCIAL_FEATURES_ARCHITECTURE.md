# Social Features Architecture - Scalable & Performant Design

**Date:** 2025-10-05  
**Status:** 📋 PLANNING  
**Scope:** Likes, Notifications, Hover Cards, Enhanced Interactions

---

## 🎯 Overview

This document outlines a comprehensive, scalable architecture for social features across the marketplace:

1. **Likes System** for assets
2. **Notification System** with bell icon
3. **Hover Cards** (reusable across entities)
4. **Enhanced Explore Cards** with all interactions
5. **Performance & Scalability** considerations

**Design Principles:**
- ✅ Performant (optimistic UI, caching, batching)
- ✅ Scalable (handles millions of interactions)
- ✅ Reusable (DRY components)
- ✅ Industry-standard patterns
- ✅ Type-safe (full TypeScript)

---

## 1. 📊 Likes System Architecture

### 1.1 Database Schema

```sql
-- Likes table (asset-focused)
CREATE TABLE likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES assets(asset_row_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, asset_id)
);

CREATE INDEX idx_likes_asset ON likes(asset_id);
CREATE INDEX idx_likes_user ON likes(user_id);
CREATE INDEX idx_likes_created ON likes(created_at DESC);

-- Materialized view for performance
CREATE MATERIALIZED VIEW asset_like_counts AS
SELECT 
  asset_id,
  COUNT(*) as like_count
FROM likes
GROUP BY asset_id;

CREATE UNIQUE INDEX ON asset_like_counts(asset_id);

-- Refresh strategy: Real-time or periodic
-- For MVP: Trigger-based real-time updates
CREATE OR REPLACE FUNCTION refresh_like_counts()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY asset_like_counts;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER like_count_refresh
AFTER INSERT OR DELETE ON likes
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_like_counts();
```

### 1.2 API Routes

```typescript
// POST /api/like/[assetId]       - Like asset
// DELETE /api/like/[assetId]     - Unlike asset  
// GET /api/like/[assetId]        - Check if liked
// GET /api/likes                 - Get user's likes
```

### 1.3 Component: LikeButton

```typescript
// apps/web/src/components/interactions/LikeButton.tsx

'use client';

import { useState } from 'react';
import { HeartIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface LikeButtonProps {
  assetId: string;
  initialLiked?: boolean;
  initialLikeCount?: number;
  variant?: 'default' | 'icon';
}

export function LikeButton({ 
  assetId, 
  initialLiked = false,
  initialLikeCount = 0,
  variant = 'default'
}: LikeButtonProps) {
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    // Optimistic update
    const previousState = isLiked;
    const previousCount = likeCount;
    
    setIsLiked(!isLiked);
    setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
    setIsLoading(true);

    try {
      const method = isLiked ? 'DELETE' : 'POST';
      const response = await fetch(`/api/like/${assetId}`, {
        method,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to toggle like');
      }

      toast.success(isLiked ? 'Removed like' : 'Liked!');
    } catch (error) {
      // Revert on error
      setIsLiked(previousState);
      setLikeCount(previousCount);
      toast.error('Failed to update like');
      console.error('[LikeButton] Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (variant === 'icon') {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        disabled={isLoading}
        className="hover:text-red-500"
      >
        {isLiked ? (
          <HeartSolid className="h-5 w-5 text-red-500" />
        ) : (
          <HeartIcon className="h-5 w-5" />
        )}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={isLoading}
      className="gap-2"
    >
      {isLiked ? (
        <HeartSolid className="h-4 w-4 text-red-500" />
      ) : (
        <HeartIcon className="h-4 w-4" />
      )}
      <span>{likeCount.toLocaleString()}</span>
    </Button>
  );
}
```

### 1.4 Performance Optimizations

**Caching Strategy:**
```typescript
// Use React Query for client-side caching
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useLike(assetId: string) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['like', assetId],
    queryFn: () => fetch(`/api/like/${assetId}`).then(r => r.json()),
    staleTime: 30000, // 30 seconds
  });

  const likeMutation = useMutation({
    mutationFn: () => fetch(`/api/like/${assetId}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['like', assetId] });
      queryClient.invalidateQueries({ queryKey: ['likes'] });
    },
  });

  return { isLiked: data?.liked, likeCount: data?.count, like: likeMutation };
}
```

**Server-Side Caching:**
```typescript
// Cache like counts in Redis
import { redis } from '@/lib/redis';

export async function getLikeCount(assetId: string): Promise<number> {
  const cached = await redis.get(`like:count:${assetId}`);
  if (cached) return parseInt(cached);

  const count = await db.query('SELECT COUNT(*) FROM likes WHERE asset_id = $1', [assetId]);
  await redis.setex(`like:count:${assetId}`, 300, count); // 5 min cache
  return count;
}
```

---

## 2. 🔔 Notification System Architecture

### 2.1 Database Schema

```sql
-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'follow', 'like', 'comment', 'asset_update', etc.
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Polymorphic associations
  related_user_id UUID,
  related_asset_id UUID,
  related_org_id UUID,
  
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read) WHERE read = FALSE;

-- Notification preferences
CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_follows BOOLEAN DEFAULT TRUE,
  email_likes BOOLEAN DEFAULT TRUE,
  email_comments BOOLEAN DEFAULT TRUE,
  push_follows BOOLEAN DEFAULT TRUE,
  push_likes BOOLEAN DEFAULT FALSE,
  push_comments BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 API Routes

```typescript
// GET /api/notifications              - Get user notifications (paginated)
// POST /api/notifications/[id]/read   - Mark as read
// POST /api/notifications/read-all    - Mark all as read
// GET /api/notifications/unread-count - Get unread count
// GET /api/notifications/preferences  - Get preferences
// PUT /api/notifications/preferences  - Update preferences
```

### 2.3 Component: NotificationBell

```typescript
// apps/web/src/components/notifications/NotificationBell.tsx

'use client';

import { useState, useEffect } from 'react';
import { BellIcon } from '@heroicons/react/24/outline';
import { BellIcon as BellSolid } from '@heroicons/react/24/solid';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';

export function NotificationBell() {
  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => fetch('/api/notifications/unread-count').then(r => r.json()),
    refetchInterval: 30000, // Poll every 30 seconds
  });

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/notifications?limit=10').then(r => r.json()),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          {unreadCount > 0 ? (
            <BellSolid className="h-5 w-5 text-primary" />
          ) : (
            <BellIcon className="h-5 w-5" />
          )}
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {/* Notification list */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 2.4 Real-Time Updates (Optional Enhancement)

```typescript
// Using WebSocket or Server-Sent Events for real-time notifications

// apps/web/src/lib/notifications/realtime.ts
export function useRealtimeNotifications() {
  useEffect(() => {
    const eventSource = new EventSource('/api/notifications/stream');
    
    eventSource.onmessage = (event) => {
      const notification = JSON.parse(event.data);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.info(notification.title, {
        description: notification.message,
        action: notification.link ? {
          label: 'View',
          onClick: () => router.push(notification.link)
        } : undefined
      });
    };

    return () => eventSource.close();
  }, []);
}
```

### 2.5 Notification Generation

```typescript
// apps/web/src/lib/notifications/generate.ts

export async function notifyFollowers(userId: string, event: NotificationEvent) {
  // Get all followers
  const followers = await db.query(
    'SELECT follower_id FROM follows_users WHERE following_id = $1',
    [userId]
  );

  // Batch insert notifications
  await db.query(`
    INSERT INTO notifications (user_id, type, title, message, related_user_id)
    SELECT 
      unnest($1::uuid[]),
      $2,
      $3,
      $4,
      $5
  `, [
    followers.map(f => f.follower_id),
    'asset_update',
    'New Asset Published',
    `${event.userName} published a new asset: ${event.assetName}`,
    userId
  ]);
}
```

---

## 3. 🎴 Hover Card System (Reusable)

### 3.1 Base Hover Card Component

```typescript
// apps/web/src/components/ui/hover-card/EntityHoverCard.tsx

'use client';

import { 
  HoverCard, 
  HoverCardContent, 
  HoverCardTrigger 
} from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';

interface EntityHoverCardProps {
  type: 'org' | 'contributor' | 'asset' | 'dataset';
  id: string;
  children: React.ReactNode;
}

export function EntityHoverCard({ type, id, children }: EntityHoverCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['entity', type, id],
    queryFn: () => fetch(`/api/entity/${type}/${id}/preview`).then(r => r.json()),
    staleTime: 60000, // 1 minute
  });

  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="top">
        {isLoading ? (
          <HoverCardSkeleton />
        ) : (
          <HoverCardContent type={type} data={data} />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
```

### 3.2 Type-Specific Cards

```typescript
// Company Hover Card
function CompanyHoverCardContent({ data }: { data: CompanyPreview }) {
  return (
    <div className="space-y-3">
      {/* Avatar + Name */}
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarImage src={data.logo_url} />
          <AvatarFallback>{data.display_name[0]}</AvatarFallback>
        </Avatar>
        <div>
          <h4 className="font-semibold">{data.display_name}</h4>
          {data.verified && <Badge variant="secondary" className="text-xs">✓ Verified</Badge>}
        </div>
      </div>

      {/* Bio */}
      {data.bio && (
        <p className="text-sm text-muted-foreground line-clamp-2">
          {data.bio}
        </p>
      )}

      {/* Stats */}
      <div className="flex gap-4 text-sm">
        <div>
          <span className="font-semibold">{data.assets_count}</span>
          <span className="text-muted-foreground"> Assets</span>
        </div>
        <div>
          <span className="font-semibold">{data.followers_count}</span>
          <span className="text-muted-foreground"> Followers</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <FollowButton type="org" id={data.id} className="flex-1" />
        <Button variant="outline" size="sm" asChild>
          <Link href={`/company/${data.slug}`}>View Profile</Link>
        </Button>
      </div>
    </div>
  );
}
```

### 3.3 Usage in Components

```typescript
// In AssetHeader or anywhere with entity links

import { EntityHoverCard } from '@/components/ui/hover-card/EntityHoverCard';

<EntityHoverCard type="org" id={asset.owner_org_slug}>
  <Link href={`/company/${asset.owner_org_slug}`}>
    by {asset.owner_org_slug}
  </Link>
</EntityHoverCard>
```

---

## 4. 🎯 Enhanced Explore Cards

### 4.1 Updated AssetCard Component

```typescript
// apps/web/src/components/marketplace/AssetCard.tsx

export function AssetCard({ asset }: { asset: UiAsset }) {
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      {/* Image/Icon */}
      <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 relative">
        {/* Badge overlays */}
        <div className="absolute top-2 right-2 flex gap-1">
          <Badge variant="secondary">{asset.kind}</Badge>
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        {/* Title */}
        <Link href={`/assets/${asset.slug}`}>
          <h3 className="font-semibold hover:text-primary line-clamp-1">
            {asset.name}
          </h3>
        </Link>

        {/* Owner with Hover Card */}
        <EntityHoverCard 
          type={asset.owner_org_slug ? 'org' : 'contributor'}
          id={asset.owner_org_slug || asset.owner_user_handle}
        >
          <Link 
            href={asset.owner_org_slug ? `/company/${asset.owner_org_slug}` : `/contributor/${asset.owner_user_handle}`}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            by {asset.owner_org_slug || `@${asset.owner_user_handle}`}
          </Link>
        </EntityHoverCard>

        {/* Rating */}
        {asset.overlay?.rating_avg && (
          <div className="flex items-center gap-1 text-sm">
            <span className="text-yellow-500">★</span>
            <span className="font-semibold">{asset.overlay.rating_avg.toFixed(1)}</span>
            {asset.overlay.rating_count && (
              <span className="text-muted-foreground">
                ({asset.overlay.rating_count})
              </span>
            )}
          </div>
        )}

        {/* Summary */}
        {asset.summary && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {asset.summary}
          </p>
        )}

        {/* Actions Row */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex gap-1">
            <LikeButton 
              assetId={asset.external_id} 
              variant="icon"
              initialLikeCount={asset.overlay?.like_count}
            />
            <BookmarkButton 
              assetId={asset.external_id}
              variant="icon"
            />
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/assets/${asset.slug}`}>
              View Details →
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 5. ⚡ Performance & Scalability

### 5.1 Database Optimization

**Indexing Strategy:**
```sql
-- Critical indexes for social features
CREATE INDEX CONCURRENTLY idx_likes_asset_created ON likes(asset_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_notifications_user_unread ON notifications(user_id, read, created_at DESC);
CREATE INDEX CONCURRENTLY idx_follows_following ON follows_users(following_id);
CREATE INDEX CONCURRENTLY idx_follows_follower ON follows_users(follower_id);

-- Partial indexes for common queries
CREATE INDEX idx_unread_notifications ON notifications(user_id, created_at DESC) 
WHERE read = FALSE;
```

**Query Optimization:**
```sql
-- Batch fetch interaction states
WITH user_interactions AS (
  SELECT 
    l.asset_id,
    l.user_id IS NOT NULL as is_liked,
    b.user_id IS NOT NULL as is_bookmarked
  FROM unnest($1::uuid[]) as asset_ids(id)
  LEFT JOIN likes l ON l.asset_id = asset_ids.id AND l.user_id = $2
  LEFT JOIN bookmarks b ON b.asset_id = asset_ids.id AND b.user_id = $2
)
SELECT * FROM user_interactions;
```

### 5.2 Caching Strategy

**Multi-Layer Cache:**
```typescript
// 1. React Query (Client-side, in-memory)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000, // 1 minute
      cacheTime: 300000, // 5 minutes
    },
  },
});

// 2. Redis (Server-side, distributed)
export async function getCachedWithFallback<T>(
  key: string,
  fallback: () => Promise<T>,
  ttl: number = 300
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const data = await fallback();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
}

// 3. Edge Cache (CDN, for public data)
export const revalidate = 60; // Next.js ISR
```

### 5.3 Batching & Deduplication

```typescript
// Batch API requests using DataLoader pattern
import DataLoader from 'dataloader';

const likeLoader = new DataLoader(async (assetIds: string[]) => {
  const results = await db.query(`
    SELECT asset_id, COUNT(*) as count
    FROM likes
    WHERE asset_id = ANY($1)
    GROUP BY asset_id
  `, [assetIds]);
  
  const map = new Map(results.rows.map(r => [r.asset_id, r.count]));
  return assetIds.map(id => map.get(id) || 0);
});

// Usage
const likeCounts = await Promise.all(
  assetIds.map(id => likeLoader.load(id))
);
```

### 5.4 Rate Limiting

```typescript
// Prevent abuse with rate limits
import { Ratelimit } from "@upstash/ratelimit";

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 likes per minute
  analytics: true,
});

export async function checkLikeRateLimit(userId: string) {
  const { success, remaining } = await ratelimit.limit(userId);
  if (!success) {
    throw new Error('Rate limit exceeded');
  }
  return remaining;
}
```

---

## 6. 📋 Implementation Roadmap

### Phase 1: Core Features (Week 1)
- [ ] Likes system database schema
- [ ] Like API routes
- [ ] LikeButton component
- [ ] Add to AssetHeader
- [ ] Add to Explore cards

### Phase 2: Notifications (Week 2)
- [ ] Notifications database schema
- [ ] Notification API routes  
- [ ] NotificationBell component
- [ ] Add to app header
- [ ] Notification generation logic

### Phase 3: Hover Cards (Week 3)
- [ ] Base HoverCard component
- [ ] Company hover card
- [ ] Contributor hover card
- [ ] Asset hover card
- [ ] Integrate everywhere

### Phase 4: Optimization (Week 4)
- [ ] Add React Query
- [ ] Implement Redis caching
- [ ] Add DataLoader batching
- [ ] Performance testing
- [ ] Load testing

---

## 7. 🧪 Testing Strategy

### Unit Tests
```typescript
describe('LikeButton', () => {
  it('toggles like state optimistically', async () => {
    const { getByRole } = render(<LikeButton assetId="123" />);
    const button = getByRole('button');
    
    await userEvent.click(button);
    expect(button).toHaveClass('text-red-500');
  });

  it('reverts on API error', async () => {
    server.use(
      rest.post('/api/like/:id', (req, res, ctx) => {
        return res(ctx.status(500));
      })
    );

    const { getByRole } = render(<LikeButton assetId="123" />);
    await userEvent.click(getByRole('button'));
    
    await waitFor(() => {
      expect(getByRole('button')).not.toHaveClass('text-red-500');
    });
  });
});
```

### Integration Tests
```typescript
describe('Notification System', () => {
  it('shows notification on new follower', async () => {
    const { user } = await createTestUser();
    await followUser(user.id);
    
    const notifications = await getNotifications(user.id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('follow');
  });
});
```

### Load Tests
```typescript
// Using k6 for load testing
import http from 'k6/http';

export default function () {
  http.post(`${BASE_URL}/api/like/${randomAssetId()}`);
}

export const options = {
  vus: 1000, // 1000 virtual users
  duration: '60s',
};
```

---

## 8. 📊 Monitoring & Analytics

### Metrics to Track
```typescript
// Key metrics
- Likes per day
- Notification delivery rate
- API response times
- Cache hit rates
- Error rates by endpoint

// User engagement
- Most liked assets
- Most active likers
- Notification open rates
- Hover card interaction rates
```

### Monitoring Setup
```typescript
// Using DataDog/New Relic
import { metrics } from '@/lib/monitoring';

export async function likeAsset(userId: string, assetId: string) {
  const start = Date.now();
  
  try {
    await db.query('INSERT INTO likes ...');
    metrics.increment('likes.success');
  } catch (error) {
    metrics.increment('likes.error');
    throw error;
  } finally {
    metrics.timing('likes.duration', Date.now() - start);
  }
}
```

---

## 9. 🚀 Deployment Checklist

### Database
- [ ] Run migrations
- [ ] Create indexes
- [ ] Set up materialized views
- [ ] Configure backup strategy

### Caching
- [ ] Set up Redis cluster
- [ ] Configure cache eviction policies
- [ ] Set up monitoring

### API
- [ ] Deploy new endpoints
- [ ] Set up rate limiting
- [ ] Configure CORS
- [ ] Enable compression

### Frontend
- [ ] Deploy new components
- [ ] Test in staging
- [ ] Monitor performance
- [ ] Gradual rollout

---

## 10. 📚 Related Documentation

- [INTERACTION_FEATURES_IMPLEMENTATION.md](./INTERACTION_FEATURES_IMPLEMENTATION.md)
- [AUTH_SYSTEM_AUDIT.md](./AUTH_SYSTEM_AUDIT.md)
- [USER_MANAGEMENT_ARCHITECTURE.md](./USER_MANAGEMENT_ARCHITECTURE.md)

---

## Summary

This architecture provides:
✅ **Scalable** - Handles millions of interactions
✅ **Performant** - Multi-layer caching, optimistic UI
✅ **Maintainable** - Reusable components, clear patterns
✅ **Industry-standard** - Battle-tested patterns
✅ **Type-safe** - Full TypeScript coverage

**Next Steps:**
1. Review & approve architecture
2. Create Jira tickets for each phase
3. Begin Phase 1 implementation
4. Set up monitoring & alerts
