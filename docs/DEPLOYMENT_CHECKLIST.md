# Deployment Checklist & Environment Variables

> Current production note, 2026-05-11: this file still contains legacy onboarding/storage setup below. For current Agent Ops, Browser Operator, Railway split-service, and channel-launch production validation, use [docs/platform/agent-ops/production-runbook.md](platform/agent-ops/production-runbook.md).

## Current Agent Ops / Browser Operator Production Checklist

Current Railway production services:

- `Lucid`: web/control-plane, `WORKER_MODE=web`
- `lucid-channels`: channel gateways
- `lucid-automation`: background/scheduled work
- `lucid-browser`: isolated Browser Operator gateway
- `Redis`: queues/cache/backlog

Required post-deploy checks:

```bash
curl -fsS https://<app-host>/ready
curl -fsS https://<app-host>/api/health
curl -fsS https://<browser-gateway-host>/ready
BROWSER_QA_CONTROL_URL=https://<browser-gateway-host> npm run agent-ops:browser-provider-smoke -- --run-session --target https://www.lucid.foundation
```

Channel launch smoke:

- Slack: `/lucid check https://www.lucid.foundation`
- Telegram: `/check https://www.lucid.foundation`
- Discord: `/ops workflow:check-page target:https://www.lucid.foundation`

Mission Control verification:

- confirm exactly one `check-page` run per smoke.
- confirm Browser Operator evidence/artifacts and findings appear.
- confirm `metadata.team_ops.channelLaunchStatus` records the launching channel.
- complete `/mission-control/browser` account-health, secure-takeover, and alert-resolution smoke with an authenticated production session.

Log watch:

- watch Railway logs for 15 to 30 minutes after deploy/smoke.
- investigate duplicate runs, channel auth failures, command timeouts, entitlement fallback warnings, DB/RLS errors, Browser Operator provider/artifact failures, quota/lease issues, or alert spam.

## ✅ What We've Built

### Code Implementation ✅
- [x] **JWT Decoder** - `src/lib/auth/get-user-id.ts`
- [x] **Storage Integration** - `src/lib/uploads/storage.ts`
- [x] **All Forms & Components** - Complete
- [x] **All Pages & Routes** - Complete
- [x] **Server Actions** - All secured with auth
- [x] **Database Layer** - Extended with all functions

### Database Migrations ✅
- [x] **001_storage_buckets.sql** - Created
- [x] **002_profile_columns.sql** - Created
- [x] **003_organizations.sql** - Created
- [x] **004_notification_preferences.sql** - Created
- [x] **migrations/README.md** - Complete guide

---

## 🔧 What You Need To Do

### 1. Run Database Migrations ⚠️ REQUIRED

Go to your Supabase Dashboard:
1. Navigate to **SQL Editor**
2. Run each migration in order:
   ```
   migrations/001_storage_buckets.sql
   migrations/002_profile_columns.sql
   migrations/003_organizations.sql
   migrations/004_notification_preferences.sql
   ```
3. Verify each one completes successfully

### 2. Verify Storage Buckets ⚠️ REQUIRED

After running migration 001, check:
- Go to **Storage** in Supabase Dashboard
- Verify `avatars` bucket exists
- Verify `org-logos` bucket exists
- Both should be PUBLIC buckets

### 3. Check Profile Table ⚠️ REQUIRED

Verify your `profiles` table has these columns:
```sql
-- Run this query to check:
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'profiles';
```

Required columns:
- `id` (UUID, primary key)
- `handle` (TEXT, unique)
- `name` (TEXT)
- `email` (TEXT)
- `avatar_url` (TEXT)
- `bio` (TEXT)
- `homepage` (TEXT)
- `interests` (TEXT[])
- `github_username` (TEXT)
- `twitter_username` (TEXT)
- `linkedin_url` (TEXT)
- `profile_public` (BOOLEAN)
- `onboarding_completed` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### 4. Test Privy JWT Structure ⚠️ REQUIRED

The JWT decoder looks for user ID in these fields (in order):
```typescript
payload.sub          // Standard JWT subject
payload.user_id      // Common backend pattern
payload.userId       // Camel case variant
payload.id           // Simple ID field
payload.privyId      // Privy-specific ID
```

**To verify:**
1. Log in with Privy
2. Check server logs for:
   ```
   [get-user-id] Decoded payload: { ... }
   [get-user-id] Found user ID: xxx
   ```
3. If user ID not found, update `get-user-id.ts` to match your JWT structure

---

## 📋 Environment Variables

### Required Variables

Add these to your `.env.local` file:

```bash
# ============================================================================
# Supabase (REQUIRED)
# ============================================================================
# Get these from Supabase Dashboard → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # For server-side operations

# ============================================================================
# Privy (REQUIRED)
# ============================================================================
# Get these from Privy Dashboard
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-app-secret
PRIVY_JWKS_URL=https://auth.privy.io/api/v1/apps/YOUR_APP_ID/jwks.json

# ============================================================================
# App Configuration (REQUIRED)
# ============================================================================
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Or your production URL
NODE_ENV=development  # Or 'production'

# ============================================================================
# Optional: External API (if using your backend)
# ============================================================================
STUDIO_API_URL=https://server.lucid.foundation  # Your backend API
```

### Current Variables Check

Your `.env.local` should already have (from what I saw):
- ✅ `NEXT_PUBLIC_PRIVY_APP_ID`
- ✅ `PRIVY_APP_SECRET`
- ✅ `PRIVY_JWKS_URL`

**You may need to ADD:**
- ⚠️ `NEXT_PUBLIC_SUPABASE_URL`
- ⚠️ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ⚠️ `SUPABASE_SERVICE_ROLE_KEY`
- ⚠️ `NEXT_PUBLIC_APP_URL`

---

## 🧪 Integration Testing Checklist

### 1. Authentication Flow ⚠️
- [ ] Log in with Privy
- [ ] Check browser console for access_token cookie
- [ ] Check server logs for JWT decode success
- [ ] Verify user ID is extracted correctly

### 2. Storage Integration ⚠️
- [ ] Upload an avatar in `/settings/profile`
- [ ] Verify file appears in Supabase Storage → avatars bucket
- [ ] Verify CDN URL is returned
- [ ] Verify image displays correctly

### 3. Database Operations ⚠️
- [ ] Complete onboarding
- [ ] Update profile settings
- [ ] Change username (test availability check)
- [ ] Create an organization
- [ ] Verify all data saved to database

### 4. Public Profiles ⚠️
- [ ] Set profile to public
- [ ] Visit `/u/[your-handle]`
- [ ] Verify profile displays
- [ ] Toggle to private
- [ ] Verify "Not Available" message

### 5. Organization Flow ⚠️
- [ ] Create organization at `/workspace/new`
- [ ] Upload org logo
- [ ] Verify slug availability check works
- [ ] Verify creator added as owner
- [ ] View org in `/settings/organizations`

---

## 🔍 Verification Queries

Run these in Supabase SQL Editor to verify everything:

### Check Storage Buckets
```sql
SELECT * FROM storage.buckets 
WHERE id IN ('avatars', 'org-logos');
```

### Check Profile Columns
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;
```

### Check Organizations Tables
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('organizations', 'organization_members', 'notification_preferences');
```

### Check RLS Policies
```sql
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('organizations', 'organization_members', 'profiles');
```

---

## ⚠️ Common Issues & Solutions

### Issue: "No access_token cookie found"
**Solution:** Verify Privy login route at `/api/auth/privy-login` is working

### Issue: "User ID not found in JWT"
**Solution:** 
1. Check server logs for decoded payload
2. Update `src/lib/auth/get-user-id.ts` to match your JWT field names

### Issue: "Storage upload failed"
**Solution:**
1. Verify buckets exist in Supabase
2. Check `NEXT_PUBLIC_SUPABASE_URL` is set
3. Verify RLS policies allow uploads

### Issue: "Handle already taken" (but it's not)
**Solution:**
1. Check if `profiles.handle` column has UNIQUE constraint
2. Verify database function `checkHandleExists` works

### Issue: "Profile not found"
**Solution:**
1. Verify user ID is being extracted correctly
2. Check if profile exists: `SELECT * FROM profiles WHERE id = 'user-id'`
3. Run onboarding to create profile

---

## 📝 Environment Variable Template

Create/update `apps/web/.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...your-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...your-service-key

# Privy
NEXT_PUBLIC_PRIVY_APP_ID=cm7kvvobw020cisjqrkr9hr2m
PRIVY_APP_SECRET=your-secret
PRIVY_JWKS_URL=https://auth.privy.io/api/v1/apps/cm7kvvobw020cisjqrkr9hr2m/jwks.json

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Optional: Your Backend API
STUDIO_API_URL=https://server.lucid.foundation
```

---

## ✅ Final Checklist

Before going live:

- [ ] All 4 database migrations run successfully
- [ ] Storage buckets created and accessible
- [ ] Environment variables configured
- [ ] Privy JWT decoding tested
- [ ] File uploads working
- [ ] Username availability check working
- [ ] Onboarding flow tested
- [ ] Settings updates working
- [ ] Public profiles displaying
- [ ] Organization creation working
- [ ] Privacy toggle working
- [ ] All server logs showing correct user IDs

---

## 🚀 Ready for Production?

**YES** if all checkboxes above are ✅

**NOT YET** if any integration points fail

**NEED HELP** if JWT structure doesn't match or storage isn't working

---

## Agent Runtime Migrations (2026-03-08)

### Supabase CLI Migrations (Applied to Production)
- [x] `20260308000000_agent_scheduled_tasks.sql` — `agent_scheduled_tasks` table, `claim_next_scheduled_task` RPC, `reset_stuck_scheduled_tasks` RPC
- [x] `20260308100000_agent_channel_type.sql` — Adds `'agent'` to `channel_type` CHECK, makes `secret_token_hash` nullable

### Verification Steps
- [ ] Verify `agent_scheduled_tasks` table exists: `SELECT count(*) FROM agent_scheduled_tasks;`
- [ ] Verify claim function works: `SELECT * FROM claim_next_scheduled_task('test-worker', 1);`
- [ ] Verify `'agent'` is a valid channel type: `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'assistant_channels';`
- [ ] Verify `secret_token_hash` is nullable: `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'assistant_channels' AND column_name = 'secret_token_hash';`

### Worker Environment Variables
No new env vars required. Agent runtime tools use existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

### Railway Worker
- [ ] Verify scheduled task polling loop starts: check logs for `[scheduler] Polling...`
- [ ] Verify OTel metrics export (if `OTEL_ENABLED=true`): `lucid.scheduler.*`, `lucid.messaging.*`, `lucid.subagent.*`

---

**Last Updated:** 2026-03-09
**Status:** All code complete, agent runtime migrations applied to production
