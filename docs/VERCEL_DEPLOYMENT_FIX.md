# Vercel Deployment Fix

## Issue
Build was failing on Vercel with:
```
ERROR: command finished with error: command (/vercel/path0/apps/web) /node20/bin/npm run build exited (1)
```

And warning about missing environment variables in turbo.json:
```
Warning - the following environment variables are set on your Vercel project, but missing from "turbo.json"
- TURBO_FORCE 
- SUPABASE_SERVICE_ROLE_KEY 
- VAPID_PRIVATE_KEY 
- EMAIL_FROM
```

## Root Causes

### 1. Missing Environment Variables in turbo.json
Turborepo needs to know which environment variables to pass through during build. Without declaring them in turbo.json, they won't be available to the build process even if set in Vercel.

### 2. Wrong Supabase Key
**CRITICAL**: You were using the **ANON** key instead of the **SERVICE_ROLE** key!

**What you had:**
```
SUPABASE_SERVICE_ROLE_KEY=<redacted-anon-key-example>
```

This JWT has `"role":"anon"` which is the PUBLIC key, not the SERVICE_ROLE key!

## Fixes Applied

### 1. Updated turbo.json
Added missing environment variables to both `dev` and `build` tasks:

```json
{
  "tasks": {
    "dev": {
      "env": [
        // ... existing vars ...
        "SUPABASE_SERVICE_ROLE_KEY",
        "VAPID_PRIVATE_KEY",
        "VAPID_PUBLIC_KEY",
        "EMAIL_FROM",
        "TURBO_FORCE"
      ]
    },
    "build": {
      "env": [
        // ... same vars as dev ...
        "SUPABASE_SERVICE_ROLE_KEY",
        "VAPID_PRIVATE_KEY",
        "VAPID_PUBLIC_KEY",
        "EMAIL_FROM",
        "TURBO_FORCE"
      ]
    }
  }
}
```

### 2. Get the Correct Supabase Service Role Key

**Where to find it:**

1. Go to your Supabase project dashboard
2. Click on **Settings** (gear icon in sidebar)
3. Click on **API**
4. Look for **Project API keys** section
5. Find the **service_role** key (NOT the anon key!)
6. The service_role JWT will have `"role":"service_role"` when decoded

**Security Warning:** 
⚠️ The service_role key bypasses Row Level Security (RLS). NEVER expose it to clients or commit it to Git!

## How to Fix in Vercel

### Step 1: Get Correct Service Role Key
```bash
# In Supabase Dashboard:
# Settings → API → Project API keys → service_role key (secret)
```

### Step 2: Update Vercel Environment Variable
```bash
# In Vercel Dashboard:
# Project Settings → Environment Variables → Edit SUPABASE_SERVICE_ROLE_KEY
```

Replace the ANON key with the actual SERVICE_ROLE key.

### Step 3: Redeploy
After updating the environment variable:
1. Go to Deployments
2. Click on the failed deployment
3. Click "Redeploy"

Or trigger a new deployment by pushing to your branch.

## Environment Variables Checklist

Make sure these are set in Vercel:

### Required for Auth
- ✅ `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anon key (safe for client)
- ✅ `SUPABASE_URL` - Same as public URL
- ✅ `SUPABASE_ANON_KEY` - Same as public anon key
- ⚠️ `SUPABASE_SERVICE_ROLE_KEY` - **SERVICE ROLE key** (NOT anon key!)

### Required for Auth (Privy)
- ✅ `NEXT_PUBLIC_PRIVY_APP_ID` - Your Privy app ID
- ✅ `PRIVY_APP_ID` - Same as public app ID
- ✅ `PRIVY_JWKS_URL` - Privy JWKS URL for token verification

### Optional but Recommended
- `VAPID_PRIVATE_KEY` - For push notifications
- `VAPID_PUBLIC_KEY` - For push notifications  
- `EMAIL_FROM` - For email notifications
- `REDIS_URL` or `UPSTASH_REDIS_REST_URL` - For caching (optional)
- `UPSTASH_REDIS_REST_TOKEN` - For caching (optional)

## Verifying the Fix

After redeploying, check:

1. **Build succeeds** - No turbo.json warnings
2. **No service role errors** - Auth system can create users
3. **Database operations work** - Can write to profiles table

## Common Mistakes to Avoid

1. ❌ Using ANON key for SERVICE_ROLE_KEY
2. ❌ Not adding env vars to turbo.json
3. ❌ Exposing SERVICE_ROLE key to client code
4. ❌ Committing SERVICE_ROLE key to Git
5. ❌ Forgetting to redeploy after updating env vars

## Success Indicators

✅ Build completes without env var warnings
✅ Auth system works (login/signup)
✅ User profiles are created automatically
✅ No RLS errors in Vercel logs

## Next Steps

After deployment succeeds:
1. Test auth flow (login/signup)
2. Verify user creation in Supabase
3. Check Vercel logs for any runtime errors
4. Monitor auth performance

## Support

If issues persist:
1. Check Vercel build logs for specific errors
2. Verify all environment variables are set correctly
3. Test locally with same env vars
4. Check Supabase logs for authentication errors
