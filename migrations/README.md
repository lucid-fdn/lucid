# Database Migrations

This directory contains SQL migrations for the user management system.

## Overview

These migrations set up the complete database schema for:
- Storage buckets (avatars, org logos)
- User profiles with privacy controls
- Organizations and memberships
- Notification preferences

## Migration Files

1. **001_storage_buckets.sql** - Supabase Storage buckets + RLS policies
2. **002_profile_columns.sql** - Profile table columns and indexes
3. **003_organizations.sql** - Organizations and membership tables
4. **004_notification_preferences.sql** - Notification preferences table

## How to Run

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste each migration file in order
4. Click **Run** for each file

### Option 2: Supabase CLI

```bash
# Run all migrations in order
supabase db push

# Or run individually
psql $DATABASE_URL -f migrations/001_storage_buckets.sql
psql $DATABASE_URL -f migrations/002_profile_columns.sql
psql $DATABASE_URL -f migrations/003_organizations.sql
psql $DATABASE_URL -f migrations/004_notification_preferences.sql
```

### Option 3: Manual (for existing tables)

If your tables already exist, you can run the migrations selectively:

```sql
-- Only run the ALTER TABLE commands from 002_profile_columns.sql
-- Only run the CREATE TABLE IF NOT EXISTS from 003_organizations.sql
-- etc.
```

## Verification

After running each migration, verify it worked:

```sql
-- Check storage buckets
SELECT * FROM storage.buckets WHERE id IN ('avatars', 'org-logos');

-- Check profile columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles';

-- Check organizations tables
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('organizations', 'organization_members');

-- Check notification preferences
SELECT * FROM notification_preferences LIMIT 1;
```

## Important Notes

### Assumptions

- You have a `profiles` table that stores user information
- Your database uses UUID for primary keys
- Supabase Auth is configured

### If Your Schema Differs

**Different table name:**
```sql
-- If your table is called 'users' instead of 'profiles'
-- Replace all instances of 'profiles' with 'users' in the migrations
```

**Different column types:**
```sql
-- If you use integer IDs instead of UUIDs
-- Update all REFERENCES and foreign keys accordingly
```

### Row Level Security (RLS)

All tables have RLS enabled with policies that:
- Allow public reads where appropriate
- Restrict writes to authenticated users
- Enforce ownership for updates/deletes

### Auto-Triggers

The migrations include triggers that automatically:
- Update `updated_at` timestamps
- Create notification preferences for new users
- Add organization creators as owners

## Rollback (if needed)

To rollback migrations:

```sql
-- Drop notification preferences
DROP TABLE IF EXISTS notification_preferences CASCADE;

-- Drop organizations
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- Drop profile columns (careful!)
ALTER TABLE profiles DROP COLUMN IF EXISTS profile_public;
ALTER TABLE profiles DROP COLUMN IF EXISTS onboarding_completed;
-- etc.

-- Drop storage buckets
DELETE FROM storage.buckets WHERE id IN ('avatars', 'org-logos');
```

## Troubleshooting

### "Table already exists" errors
- These are safe to ignore if using `IF NOT EXISTS`
- Or drop the existing tables first (be careful with data!)

### Foreign key constraint errors
- Ensure `profiles` table exists before running migrations
- Check that user IDs are UUIDs (or update migrations)

### RLS policy errors
- Ensure Supabase Auth is properly configured
- Check that `auth.uid()` returns a valid UUID

## Next Steps

After running migrations:

1. **Verify** all tables and columns exist
2. **Test** uploading files to storage buckets
3. **Test** creating profiles and organizations
4. **Monitor** RLS policies are working correctly

## Support

If you encounter issues:
1. Check Supabase dashboard logs
2. Verify your schema matches assumptions
3. Adjust migrations for your specific setup
4. Review error messages carefully

---

**Status:** Ready for production ✅
**Last Updated:** 2025-10-06
