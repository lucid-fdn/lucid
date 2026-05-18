# Asset Detail, Company & Contributor Pages - Implementation Tracker

## ✅ Completed

### Lib Layer (Server-only)
- [x] `src/lib/marketplace/asset-detail.ts` - Asset fetching with overlays
- [x] `src/lib/marketplace/company.ts` - Org data + assets
- [x] `src/lib/marketplace/contributor.ts` - Contributor + personal assets only
- [x] `src/lib/marketplace/types.ts` - Added owner filters

### Key Features Implemented
- ✅ Mock fallback for all fetching functions
- ✅ Single Supabase overlay query (no N+1)
- ✅ Server-only enforcement with 'server-only' directive
- ✅ Graceful error handling with fallbacks
- ✅ Performance logging
- ✅ Contributor assets filtered (no company assets)

## 🚧 Remaining Work

### Components (3 files)
- [ ] `src/components/marketplace/AssetHeader.tsx`
  - Name, version, summary, tags
  - Owner chip (Company OR Contributor, never both)
  - Metrics (rating, runs, p95, cost, EU, CC)
  
- [ ] `src/components/marketplace/CompanyHeader.tsx`
  - Logo, display_name, verified badge
  - Bio, website, socials
  - Stats (assets_count, followers_count)
  - NO contributors list
  
- [ ] `src/components/marketplace/ContributorHeader.tsx`
  - Avatar, name, handle
  - Bio if available
  - Simple asset count

### Routes - Asset Detail (3 files)
- [ ] `src/app/(studio)/assets/[slug]/page.tsx` - SSR with metadata
- [ ] `src/app/(studio)/assets/[slug]/loading.tsx` - Skeleton
- [ ] `src/app/(studio)/assets/[slug]/not-found.tsx` - 404

### Routes - Company (2 files)  
- [ ] Update `src/app/(studio)/company/[slug]/page.tsx` - Use new lib
- [ ] Update `src/app/(studio)/company/[slug]/loading.tsx` - Better skeleton

### Routes - Contributor (2 files)
- [ ] `src/app/(studio)/contributor/[handle]/page.tsx` - SSR with metadata
- [ ] `src/app/(studio)/contributor/[handle]/loading.tsx` - Skeleton

## 📋 Implementation Checklist

### Owner Display Rules (CRITICAL)
- [ ] If `owner_org_slug` present → show Company link ONLY
- [ ] If NO company but `owner_user_handle` → show Contributor link
- [ ] Never show both
- [ ] Company pages: NO contributors list
- [ ] Contributor pages: filter out company assets

### Performance Requirements
- [ ] All fetches server-side (RSC)
- [ ] `revalidate: 60` on ES calls
- [ ] Single overlay query per page
- [ ] Route-level loading.tsx
- [ ] generateMetadata per page
- [ ] Mock fallback when API missing

### Acceptance Criteria
- [ ] `/assets/[slug]` renders with correct owner chip
- [ ] `/company/[slug]` shows org + assets (no contributors)
- [ ] `/contributor/[handle]` shows only personal assets
- [ ] Overlay = single IN query per page
- [ ] Works with mock when ASSETS_API_BASE absent
- [ ] No console errors
- [ ] Fast first paint with skeletons

## 🗄️ Database Setup (User Action Required)

### Already Created
- ✅ `supabase_marketplace_schema.sql` - Full schema
- ✅ `supabase_marketplace_seed.sql` - Sample data
- ✅ `SUPABASE_SETUP.md` - Setup instructions

### User Must Do
1. Run schema SQL in Supabase SQL Editor
2. Run seed SQL in Supabase SQL Editor
3. Add env vars to `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
4. (Optional) Set ASSETS_API_BASE for live ES data

### Optional: Profiles Table for Contributors
If you want full contributor profiles, add to Supabase:

```sql
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_handle ON public.profiles(handle);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone" 
  ON public.profiles FOR SELECT 
  USING (true);
```

## 📝 Next Steps

1. **Components**: Create the 3 header components with shadcn/ui
2. **Routes**: Implement all route files with SSR
3. **Update Company**: Refactor existing company page to use new lib
4. **Test**: Verify owner display rules work correctly
5. **Database**: User runs SQL setup in Supabase

## 🎯 Estimated Remaining Time
- Components: ~30 minutes
- Routes: ~45 minutes
- Testing: ~15 minutes
- **Total: ~1.5 hours**

## ⚠️ Critical Notes

1. **Owner Logic**: Test that assets NEVER show both company and contributor
2. **Contributor Filter**: Ensure company assets excluded from contributor pages
3. **Mock Fallback**: All pages must work without API/Supabase configured
4. **Single Query**: Verify overlay fetch is ONE query, not per-card
5. **Server-only**: All lib functions have 'server-only' directive

## 🔗 Related Files

- `MARKETPLACE.md` - Architecture overview
- `SUPABASE_SETUP.md` - Database setup guide
- `supabase_marketplace_schema.sql` - Schema
- `supabase_marketplace_seed.sql` - Seed data
