# UI Implementation Tasks - Remaining Work

**Date:** 2025-10-06
**Status:** In Progress

---

## ✅ Completed

### 1. Asset Cards (Explore Page)
```
✅ Show current rating (★)
✅ Show likes count (❤)
✅ Show bookmarks count (🔖)
✅ Updated TypeScript types
```

**Files Updated:**
- `apps/web/src/components/marketplace/AssetCard.tsx`
- `apps/web/src/lib/marketplace/types.ts`

---

## 🔨 Remaining Tasks

### 2. Asset Detail Page - Company Follow Section

**Current State:**
- Follow button shows only button
- No company logo, name, or follower count

**Required Changes:**
```tsx
// In AssetHeader.tsx, replace follow button with rich company card

{asset.owner_org_slug && (
  <div className="flex items-center gap-3 p-3 border rounded-lg">
    {/* Company Logo */}
    <img 
      src={companyLogo || '/default-company.png'} 
      alt={asset.owner_org_slug}
      className="w-12 h-12 rounded-full"
    />
    
    {/* Company Info */}
    <div className="flex-1">
      <Link href={`/company/${asset.owner_org_slug}`}>
        <h4 className="font-semibold hover:text-primary">
          {companyName || asset.owner_org_slug}
        </h4>
      </Link>
      <p className="text-sm text-muted-foreground">
        {followersCount} followers
      </p>
    </div>
    
    {/* Follow Button */}
    <FollowButton 
      type="org" 
      id={asset.owner_org_slug}
    />
  </div>
)}
```

**Files to Update:**
- `apps/web/src/components/marketplace/AssetHeader.tsx`
- Fetch company data (logo, name, followers) from Supabase
- Add to asset detail query

---

### 3. Company/Creator Pages

**Current Issues:**
- "Back to explore" button not needed
- Missing notification button
- Showing all companies (should show only public)

**Required Changes:**

#### A. Remove Back Button
```tsx
// In apps/web/src/app/(studio)/company/[slug]/page.tsx
// DELETE this section:
<Link href="/explore" className="text-primary hover:underline">
  ← Back to Explore
</Link>
```

#### B. Add Notification Button
```tsx
// Add to company page header
import { NotificationBell } from '@/components/notifications/NotificationBell';

<div className="flex items-center gap-3">
  <NotificationBell />
  {/* Other actions */}
</div>
```

#### C. Filter Public Companies Only
```sql
-- Update company query to filter by public status
SELECT * FROM companies 
WHERE slug = $1 
AND is_public = true;
```

**Files to Update:**
- `apps/web/src/app/(studio)/company/[slug]/page.tsx`
- `apps/web/src/app/(studio)/contributor/[handle]/page.tsx`
- `apps/web/src/lib/marketplace/company.ts` (add public filter)

---

### 4. Hover Cards on Company Links

**Current Issue:**
- Hover cards not working on company links in:
  - Explore page (AssetCard)
  - Asset detail page (AssetHeader)

**Required Implementation:**
```tsx
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

// Wrap company link
<HoverCard>
  <HoverCardTrigger asChild>
    <Link 
      href={`/company/${asset.owner_org_slug}`}
      className="text-primary hover:underline"
    >
      {asset.owner_org_slug}
    </Link>
  </HoverCardTrigger>
  <HoverCardContent className="w-80">
    <div className="flex gap-3">
      <img 
        src={company.logo} 
        className="w-12 h-12 rounded-full"
      />
      <div className="space-y-1">
        <h4 className="font-semibold">{company.name}</h4>
        <p className="text-sm text-muted-foreground">
          {company.description}
        </p>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{company.assetsCount} assets</span>
          <span>{company.followersCount} followers</span>
        </div>
      </div>
    </div>
  </HoverCardContent>
</HoverCard>
```

**Requirements:**
- Create `CompanyHoverCard` component
- Fetch company data on hover (with caching)
- Add to AssetCard and AssetHeader

**Files to Create/Update:**
- `apps/web/src/components/marketplace/CompanyHoverCard.tsx` (new)
- `apps/web/src/components/marketplace/AssetCard.tsx`
- `apps/web/src/components/marketplace/AssetHeader.tsx`
- `apps/web/src/lib/marketplace/company-hover.ts` (new - API)

---

## 📊 Implementation Priority

### P0 (Critical - User Facing)
1. ✅ Asset cards social metrics (likes, bookmarks, rating)
2. Asset page company follow with logo/followers
3. Hover cards on company links

### P1 (Important - UX)
4. Remove "Back to explore" from company pages
5. Add notification button to company pages
6. Filter public companies only

---

## 🔧 Technical Details

### Company Data Structure
```typescript
interface CompanyInfo {
  slug: string;
  name: string;
  logo_url?: string;
  description?: string;
  followers_count: number;
  assets_count: number;
  is_public: boolean;
}
```

### API Endpoints Needed
```typescript
// Get company info for hover card
GET /api/company/[slug]/info
Response: CompanyInfo

// Get company followers count
GET /api/company/[slug]/followers
Response: { count: number }
```

### Database Queries
```sql
-- Company with followers count
SELECT 
  c.*,
  COUNT(DISTINCT f.follower_id) as followers_count,
  COUNT(DISTINCT a.id) as assets_count
FROM companies c
LEFT JOIN follows_orgs f ON c.id = f.org_id
LEFT JOIN assets a ON c.id = a.owner_org_id
WHERE c.slug = $1
AND c.is_public = true
GROUP BY c.id;
```

---

## 📝 Step-by-Step Implementation

### Step 1: Company Data Infrastructure
```bash
# Create company info API
touch apps/web/src/app/api/company/[slug]/info/route.ts

# Create company hover component
touch apps/web/src/components/marketplace/CompanyHoverCard.tsx

# Create company data fetcher
touch apps/web/src/lib/marketplace/company-hover.ts
```

### Step 2: Update Asset Pages
1. Update AssetHeader with rich company card
2. Add CompanyHoverCard to AssetCard
3. Add CompanyHoverCard to AssetHeader

### Step 3: Update Company Pages
1. Remove back button
2. Add NotificationBell
3. Add public filter to queries

### Step 4: Test
- Hover over company links → shows card
- Asset page → shows company with logo/followers
- Company page → notification bell visible, only public

---

## 🎯 Expected Result

### Explore Page
```
[Asset Card]
━━━━━━━━━━━━━━━━━
Model Name v1.0
★ 4.5 (12)  ❤ 45  🔖 23

by CompanyName (hover shows card)
[Try] [Details]
━━━━━━━━━━━━━━━━━
```

### Asset Detail Page
```
━━━━━━━━━━━━━━━━━━━━
Asset Name v1.0

[Company Card]
┌─────────────────┐
│ [Logo] Company  │ [Follow]
│        123 followers │
└─────────────────┘

★★★★☆ Rate this
❤ Like  🔖 Bookmark
━━━━━━━━━━━━━━━━━━━━
```

### Company Page
```
━━━━━━━━━━━━━━━━━━━━
            🔔 [Notifications]

Company Name
(only if public)

Assets by this company...
━━━━━━━━━━━━━━━━━━━━
```

---

## ✅ Files to Update Summary

### New Files (3)
```
1. apps/web/src/app/api/company/[slug]/info/route.ts
2. apps/web/src/components/marketplace/CompanyHoverCard.tsx
3. apps/web/src/lib/marketplace/company-hover.ts
```

### Update Files (5)
```
1. apps/web/src/components/marketplace/AssetCard.tsx (add hover card)
2. apps/web/src/components/marketplace/AssetHeader.tsx (rich company card)
3. apps/web/src/app/(studio)/company/[slug]/page.tsx (remove back, add bell)
4. apps/web/src/app/(studio)/contributor/[handle]/page.tsx (same as above)
5. apps/web/src/lib/marketplace/company.ts (add public filter)
```

---

## 💡 Notes

- Use React Query for hover card data caching
- Implement debounce on hover (300ms) before fetch
- Handle loading states in hover card
- Handle company not found gracefully
- Add proper TypeScript types for all new data structures

---

**Ready to implement these changes step by step!**
