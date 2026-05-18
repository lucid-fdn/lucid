# Industry-Grade Development Pipeline Setup

## Overview

**Yes, Vercel fully supports staging environments!** This guide shows you how to set up a production-ready deployment pipeline with proper environment separation.

## The Industry Standard Pipeline

```
Local Development → Staging → Production
     (dev)          (staging)   (production)
```

### Why 3 Environments?

1. **Local/Development** - Fast iteration, debugging
2. **Staging** - Pre-production testing, QA, client reviews
3. **Production** - Live users, stable, monitored

## Vercel Environment Strategy

Vercel provides **3 types of deployments**:

### 1. Production Deployment
- **Trigger:** Push to `main` branch
- **Domain:** `lucidmerged.com` (your custom domain)
- **Environment:** `NEXT_PUBLIC_ENVIRONMENT=production`
- **Use:** Live users

### 2. Preview Deployments (Staging)
- **Trigger:** Push to ANY non-main branch (e.g., `staging`, `develop`)
- **Domain:** Auto-generated (e.g., `lucidmerged-git-staging-raijin.vercel.app`)
- **Environment:** `NEXT_PUBLIC_ENVIRONMENT=staging`
- **Use:** Testing, QA, demos

### 3. Local Development
- **Trigger:** `npm run dev`
- **Domain:** `localhost:3000`
- **Environment:** `NEXT_PUBLIC_ENVIRONMENT=development`
- **Use:** Development, debugging

## Git Branch Strategy

### Recommended Setup

```
main           ← Production (auto-deploys to lucidmerged.com)
  ↑
staging        ← Pre-production (auto-deploys to preview URL)
  ↑
develop        ← Integration branch
  ↑
feature/*      ← Feature branches (each gets preview deployment)
```

### Workflow

1. **Create feature branch:**
   ```bash
   git checkout develop
   git pull
   git checkout -b feature/new-feature
   ```

2. **Develop & test locally:**
   ```bash
   npm run dev
   # Test at localhost:3000
   ```

3. **Push for preview:**
   ```bash
   git push origin feature/new-feature
   # Vercel creates preview deployment automatically
   # Get URL from Vercel dashboard
   ```

4. **Merge to staging for QA:**
   ```bash
   git checkout staging
   git merge feature/new-feature
   git push origin staging
   # Vercel deploys to staging preview URL
   # QA team tests here
   ```

5. **Deploy to production:**
   ```bash
   git checkout main
   git merge staging
   git push origin main
   # Vercel deploys to lucidmerged.com
   ```

## Vercel Configuration

### Step 1: Set Up Git Integration

1. Go to Vercel Dashboard → Your Project
2. Settings → Git
3. **Production Branch:** `main`
4. **Enable Automatic Deployments:** ✅

### Step 2: Configure Environment Variables

Navigate to: **Project Settings → Environment Variables**

#### For Production (main branch)
```bash
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_DSN=your_dsn
SUPABASE_URL=your_production_supabase
# ... other production vars
```

#### For Preview (all other branches)
```bash
NEXT_PUBLIC_ENVIRONMENT=staging
NEXT_PUBLIC_SENTRY_DSN=same_dsn
SUPABASE_URL=your_staging_supabase
# ... other staging vars
```

#### For Development (local only - .env.local)
```bash
NEXT_PUBLIC_ENVIRONMENT=development
NEXT_PUBLIC_SENTRY_DSN=your_dsn
SUPABASE_URL=your_local_or_dev_supabase
```

### Step 3: Branch-Specific Environments (Advanced)

You can set different environment variables for specific branches:

1. Go to Environment Variables
2. For each variable, specify which environments it applies to:
   - **Production** (main branch)
   - **Preview** (all other branches)
   - **Development** (local)

**Example:**
```
Variable: NEXT_PUBLIC_API_URL
Production: https://api.lucid.foundation
Preview: https://staging-api.lucid.foundation
Development: http://localhost:8001
```

## Deployment URLs

### Production
- **Main domain:** `lucidmerged.com`
- **Vercel default:** `lucidmerged.vercel.app`

### Staging (Preview)
- **Staging branch:** `lucidmerged-git-staging-raijin.vercel.app`
- **Feature branches:** `lucidmerged-git-feature-name-raijin.vercel.app`

### Custom Staging Domain (Optional)
Add a custom domain for staging:
1. Settings → Domains
2. Add `staging.lucidmerged.com`
3. Point to staging preview deployment

## Environment-Specific Configuration

### Update Sentry Config (Already Done! ✅)

Your Sentry configs now include:
```typescript
environment: process.env.NEXT_PUBLIC_ENVIRONMENT || process.env.NODE_ENV || 'development'
```

This automatically tags errors by environment.

### Feature Flags by Environment

```typescript
// src/lib/feature-flags.ts
export const FEATURE_FLAGS = {
  NEW_FEATURE: process.env.NEXT_PUBLIC_ENVIRONMENT === 'production' 
    ? false  // Hide in production
    : true,  // Show in staging/dev
}
```

### Database Strategy

#### Option 1: Shared Database (Simple)
- Use same Supabase project for all environments
- Use RLS (Row Level Security) for data separation

#### Option 2: Separate Databases (Recommended)
```bash
# Production
SUPABASE_URL=https://prod-project.supabase.co

# Staging
SUPABASE_URL=https://staging-project.supabase.co

# Development
SUPABASE_URL=http://localhost:54321  # Local Supabase
```

## Vercel Preview Features

### Automatic Preview Deployments
- ✅ Every commit gets a unique URL
- ✅ Perfect for sharing with team/clients
- ✅ Comments on GitHub PRs with preview link

### Preview Protection
Settings → Deployment Protection:
- **Password protect previews** (for client demos)
- **Vercel auth** (for team-only access)

### Preview Deployment Workflow
```bash
# 1. Create PR
git checkout -b feature/add-payments
git commit -m "Add payment integration"
git push origin feature/add-payments

# 2. Vercel automatically:
# - Builds the branch
# - Creates preview URL
# - Comments URL on GitHub PR

# 3. Share preview URL with team:
"Check out the new payment flow:
https://lucidmerged-git-add-payments-raijin.vercel.app"

# 4. Merge PR → Deploys to staging
# 5. Approve staging → Deploys to production
```

## CI/CD Pipeline

### Vercel Automatic Pipeline

```
Code Push → Vercel Build → Deploy → Health Checks
```

**What Vercel does automatically:**
1. Detects git push
2. Installs dependencies
3. Runs `npm run build`
4. Runs tests (if configured)
5. Deploys to CDN
6. Invalidates cache
7. Updates DNS

### Add Quality Checks

#### GitHub Actions (Optional)
```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
```

## Monitoring by Environment

### Sentry
- Filter by environment
- Different alert rules per environment
- Higher sample rates in staging

### Analytics
```typescript
// Only track in production
if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'production') {
  analytics.track('page_view')
}
```

## Best Practices

### 1. Environment Parity
Keep staging and production as similar as possible:
- ✅ Same Node version
- ✅ Same dependencies
- ✅ Same build process
- ✅ Similar data volume

### 2. Database Migrations
```bash
# Test migration in staging first
supabase db push --linked staging

# If successful, push to production
supabase db push --linked production
```

### 3. Rollback Strategy
Vercel makes this easy:
1. Go to Deployments
2. Find last working deployment
3. Click "Promote to Production"
4. Instant rollback!

### 4. Environment Variables
- ✅ Use secrets for sensitive data
- ✅ Different API keys per environment
- ✅ Never commit `.env.local`
- ✅ Document all variables in `.env.local.example`

### 5. Testing Checklist

**Before deploying to production:**
- [ ] All tests pass
- [ ] Staging deployment successful
- [ ] Manual QA on staging
- [ ] Performance check
- [ ] Error rate check (Sentry)
- [ ] Database migrations tested

## Quick Setup (10 Minutes)

### 1. Create Branches
```bash
# Create staging branch
git checkout -b staging
git push origin staging

# Create develop branch
git checkout -b develop
git push origin develop
```

### 2. Configure Vercel
1. Dashboard → Project Settings → Git
2. Set production branch: `main`
3. Enable preview deployments: ✅

### 3. Set Environment Variables
1. Project Settings → Environment Variables
2. Add `NEXT_PUBLIC_ENVIRONMENT`:
   - Production: `production`
   - Preview: `staging`

### 4. Test It
```bash
# Push to staging
git checkout staging
git commit -m "test staging" --allow-empty
git push origin staging

# Check Vercel dashboard for preview URL
# Should see environment=staging in Sentry
```

## Cost Considerations

### Vercel Pricing (as of 2024)
- **Hobby:** Free
  - Unlimited preview deployments
  - 1 production deployment per push
  
- **Pro:** $20/month per team
  - Everything in Hobby
  - Team collaboration
  - Password protection
  - Advanced analytics

### Database Costs
- **Single database:** $0 extra
- **Separate databases:** ~$25/month per environment (Supabase Pro)

## Troubleshooting

### Preview Deployment Not Showing?
1. Check Git integration is enabled
2. Verify branch is pushed to GitHub
3. Check Vercel build logs

### Wrong Environment Variables?
1. Project Settings → Environment Variables
2. Check which environments each variable applies to
3. Redeploy to pick up changes

### Staging Using Production Data?
1. Check `SUPABASE_URL` in preview environment
2. Should point to staging database
3. Update and redeploy

## Advanced: Multi-Region Staging

For global teams:
```bash
# US Staging
vercel --prod --target staging-us

# EU Staging  
vercel --prod --target staging-eu

# APAC Staging
vercel --prod --target staging-apac
```

## Summary

✅ **Yes, Vercel fully supports staging!**

**Quick Setup:**
1. Create `staging` branch
2. Push to staging → Auto-deploy to preview URL
3. Set `NEXT_PUBLIC_ENVIRONMENT=staging` for preview deployments
4. Test on staging before merging to `main` (production)

**Industry-Grade Pipeline:**
```
Local (dev) → Staging (preview) → Production (main)
  ↓              ↓                    ↓
localhost    staging.vercel.app   lucidmerged.com
```

**Benefits:**
- 🔄 Automatic deployments
- 🔍 Preview every change
- 🛡️ Test before production
- 📊 Separate monitoring
- ⚡ Instant rollbacks
- 🌍 Global CDN

You now have an enterprise-grade deployment pipeline! 🚀
