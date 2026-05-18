# 🗄️ Supabase Marketplace Setup Guide

Complete guide to setting up your Supabase database for the marketplace overlay system.

---

## 📋 Prerequisites

- A Supabase account (free tier works fine)
- Your Next.js app already configured with Privy Auth

---

## 🚀 Quick Setup (5 minutes)

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Create a new project:
   - **Name**: `lucid-marketplace` (or your choice)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
4. Wait ~2 minutes for project creation

### Step 2: Get Your Credentials

1. In your Supabase project, go to **Settings** → **API**
2. Copy these values:
   ```
   Project URL: https://xxxxx.supabase.co
   anon/public key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. Add to your `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
   ```

### Step 3: Run Schema SQL

1. In Supabase, go to **SQL Editor** (left sidebar)
2. Click **+ New query**
3. Copy the entire contents of `supabase_marketplace_schema.sql`
4. Paste into the editor
5. Click **Run** (bottom right)
6. Wait ~10-15 seconds
7. You should see: **Success. No rows returned**

### Step 4: Run Seed Data SQL

1. Click **+ New query** again
2. Copy the entire contents of `supabase_marketplace_seed.sql`
3. Paste into the editor
4. Click **Run**
5. You should see results showing:
   ```
   org_count: 11
   asset_count: 12
   ```

### Step 5: Verify Setup

1. In Supabase, go to **Table Editor** (left sidebar)
2. You should see these tables:
   - `organizations` (11 rows)
   - `assets` (12 rows)
   - `organization_members`
   - `ratings`
   - `bookmarks`
   - `follows_orgs`
   - `runs`
   - `categories`
   - `asset_categories`

3. Click on `assets` table and you should see 12 items like:
   - Mistral 7B Instruct
   - Llama 3 8B
   - GPT-4 Vision
   - etc.

### Step 6: Test Your App

1. Restart your Next.js dev server:
   ```bash
   npm run dev
   ```

2. Navigate to:
   ```
   http://localhost:3000/explore
   ```

3. You should now see **12 assets with overlay data**:
   - ⭐ Ratings (shown but empty until you add reviews)
   - 🏃 Run counts (matching seed data)
   - All other metrics from Supabase

---

## 📊 What Was Created

### Tables (9):
1. **organizations** - Companies/publishers
2. **organization_members** - Team membership
3. **assets** - Overlay data linking to ES
4. **categories** - Asset categories (optional)
5. **asset_categories** - Many-to-many link
6. **ratings** - User reviews (1-5 stars)
7. **follows_orgs** - User following companies
8. **bookmarks** - User saved assets
9. **runs** - Execution history & receipts

### Materialized Views (3):
1. **asset_rating_agg** - Aggregated ratings (avg, count)
2. **asset_run_agg** - 30-day run statistics
3. **organization_stats** - Company followers & assets

### Security:
- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Public assets are readable by everyone
- ✅ Users can only manage their own bookmarks/follows
- ✅ Ratings require authentication

---

## 🔧 Troubleshooting

### Problem: "Could not find table 'public.assets'"

**Cause**: Schema SQL didn't run successfully

**Fix**:
1. Go to SQL Editor
2. Run this query to check:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```
3. If tables are missing, re-run `supabase_marketplace_schema.sql`

### Problem: "No overlay data showing"

**Cause**: Seed data wasn't inserted

**Fix**:
1. Check asset count:
   ```sql
   SELECT COUNT(*) FROM public.assets;
   ```
2. If 0, re-run `supabase_marketplace_seed.sql`

### Problem: "Permission denied"

**Cause**: RLS policies blocking access

**Fix**:
1. Check you're using the correct anon key (not service role)
2. Verify RLS policies:
   ```sql
   SELECT * FROM pg_policies WHERE schemaname = 'public';
   ```

### Problem: Materialized views not updating

**Fix**: Manually refresh:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY public.asset_rating_agg;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.asset_run_agg;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.organization_stats;
```

---

## 🎯 Optional: Add Test Ratings

To see ratings in action, you need to be logged in and add a rating.

1. Log in to your app (via Privy)
2. Get your user ID from the browser console:
   ```javascript
   // In browser console
   console.log(user.id); // Your Privy user ID
   ```

3. In Supabase SQL Editor, add a test rating:
   ```sql
   -- Replace 'YOUR_USER_ID' with your actual user UUID from Privy
   INSERT INTO public.ratings (asset_id, user_id, score, comment)
   VALUES (
     (SELECT id FROM public.assets WHERE external_id = 'mdl_mistral_7b'),
     'YOUR_USER_ID',
     5,
     'Excellent model for chat applications!'
   );
   ```

4. Refresh the materialized view:
   ```sql
   REFRESH MATERIALIZED VIEW CONCURRENTLY public.asset_rating_agg;
   ```

5. Reload `/explore` - you should now see a ⭐ 5.0 (1) rating!

---

## 📈 Monitoring & Maintenance

### Check Table Sizes
```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Refresh All Materialized Views (Run weekly)
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY public.asset_rating_agg;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.asset_run_agg;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.organization_stats;
```

### Check RLS Policies
```sql
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
```

---

## 🔐 Production Checklist

Before going to production:

- [ ] Changed database password to strong password
- [ ] RLS policies reviewed and tested
- [ ] Materialized views scheduled to refresh (cron job or manual)
- [ ] Backup strategy in place (Supabase automatic backups on Pro plan)
- [ ] Monitoring set up (Supabase built-in metrics)
- [ ] API rate limits configured
- [ ] Service role key kept secret (never in client code)

---

## 📚 Related Files

- `supabase_marketplace_schema.sql` - Database schema (run first)
- `supabase_marketplace_seed.sql` - Sample data (run second)
- `src/lib/marketplace/supabase.ts` - TypeScript client code
- `MARKETPLACE.md` - Complete marketplace documentation

---

## 🆘 Need Help?

### Supabase Resources:
- [Supabase Docs](https://supabase.com/docs)
- [RLS Policies Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Materialized Views](https://supabase.com/docs/guides/database/materialized-views)

### Common Issues:
- Check Supabase Dashboard → **Logs** for errors
- Verify your API keys are correct
- Ensure `.env.local` is loaded (restart dev server)

---

## ✅ Success Criteria

Your setup is complete when:

1. ✅ Tables visible in Supabase Table Editor
2. ✅ 11 organizations and 12 assets in database
3. ✅ `/explore` shows all 12 cards with overlay data
4. ✅ Run counts showing from database (not just 0)
5. ✅ No "Could not find table" errors in console
6. ✅ Company pages work (`/company/mistral-ai`)

**If all ✅, you're ready for production!** 🎉

---

## 🚀 Next Steps

1. **Connect Your ES API**: Add `ASSETS_API_BASE` to switch from mock to live data
2. **Add Real Users**: Implement rating/bookmark UI
3. **Add More Assets**: Insert your own assets matching your ES data
4. **Customize**: Modify schema for your specific needs

**The marketplace will now seamlessly blend ES search with Supabase overlay data!**
