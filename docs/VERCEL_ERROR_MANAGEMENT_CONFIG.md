# Vercel Error Management Configuration Guide

## Overview

This guide explains the **vercel.json-based error management configuration** for LucidMerged. This approach centralizes all error monitoring, security headers, health checks, and monitoring configuration directly in Vercel's deployment configuration.

## Configuration Location

**File:** `vercel.json`

All error management, monitoring, and security configurations are defined here and automatically applied during Vercel deployment.

## Configuration Breakdown

### 1. Git Deployment Configuration (Critical!)

```json
"git": {
  "deploymentEnabled": {
    "main": "production",
    "staging": "preview",
    "develop": "preview"
  }
}
```

**What This Does:**
- `main` branch → **Production deployment** (https://your-app.vercel.app)
- `staging` branch → **Preview deployment** (https://your-app-git-staging-xxx.vercel.app)
- `develop` branch → **Preview deployment** (https://your-app-git-develop-xxx.vercel.app)

**⚠️ CRITICAL:** Do NOT use `true` instead of `"production"`/`"preview"`!
- ❌ `"main": true` → Makes main a production deployment (correct)
- ❌ `"staging": true` → Makes staging ALSO a production deployment (WRONG - will overwrite main!)
- ✅ `"staging": "preview"` → Makes staging a preview-only deployment (CORRECT)

**Why This Matters:**
- Only ONE branch should be `"production"` (usually `main`)
- All other branches should be `"preview"`
- This prevents staging/develop from overwriting your production environment

### 2. Environment-Specific Variables

```json
"environments": {
  "production": {
    "env": {
      "NEXT_PUBLIC_ENVIRONMENT": "production"
    }
  },
  "preview": {
    "env": {
      "NEXT_PUBLIC_ENVIRONMENT": "staging"
    }
  }
}
```

**What This Does:**
- Production deployment (main) gets `NEXT_PUBLIC_ENVIRONMENT=production`
- Preview deployments (staging, develop) get `NEXT_PUBLIC_ENVIRONMENT=staging`
- Each environment can have different environment variables

**Benefits:**
- Environment-aware code can behave differently in staging vs production
- Analytics, debugging, and feature flags can distinguish environments
- No need to manually set environment per branch

### 3. Environment Variables (Sentry Integration)

```json
"env": {
  "NEXT_PUBLIC_ENVIRONMENT": "production",
  "NEXT_PUBLIC_SENTRY_DSN": "@sentry-dsn",
  "SENTRY_ORG": "@sentry-org",
  "SENTRY_PROJECT": "@sentry-project",
  "SENTRY_AUTH_TOKEN": "@sentry-auth-token"
}
```

**What This Does:**
- Configures Sentry error tracking for production
- Uses Vercel's secret management (`@secret-name` format)
- Makes environment available to both client and server

**Required Vercel Secrets:**
```bash
# Set these in Vercel dashboard or CLI
vercel secrets add sentry-dsn "your-sentry-dsn"
vercel secrets add sentry-org "your-org"
vercel secrets add sentry-project "your-project"
vercel secrets add sentry-auth-token "your-token"
```

### 2. Build Configuration

```json
"build": {
  "env": {
    "NEXT_PUBLIC_ENVIRONMENT": "production",
    "NEXT_PUBLIC_SENTRY_DSN": "@sentry-dsn",
    "SENTRY_ORG": "@sentry-org",
    "SENTRY_PROJECT": "@sentry-project",
    "SENTRY_AUTH_TOKEN": "@sentry-auth-token",
    "SENTRY_UPLOAD_SOURCEMAPS": "true"
  }
}
```

**What This Does:**
- Makes secrets available during build time
- Enables source map upload to Sentry for better error tracking
- Ensures environment variables are available for Next.js build

**Benefits:**
- Better error stack traces in production
- Easier debugging with original source code
- Automatic source map upload on each deployment

### 3. Security Headers

```json
"headers": [
  {
    "source": "/(.*)",
    "headers": [
      {
        "key": "X-Frame-Options",
        "value": "DENY"
      },
      {
        "key": "X-Content-Type-Options",
        "value": "nosniff"
      },
      {
        "key": "Referrer-Policy",
        "value": "strict-origin-when-cross-origin"
      },
      {
        "key": "Permissions-Policy",
        "value": "camera=(), microphone=(), geolocation=()"
      }
    ]
  }
]
```

**What This Does:**

| Header | Protection | Prevents |
|--------|-----------|----------|
| `X-Frame-Options: DENY` | Clickjacking | Embedding site in iframes |
| `X-Content-Type-Options: nosniff` | MIME sniffing | Browser executing files as wrong type |
| `Referrer-Policy` | Privacy | Leaking sensitive URLs to third parties |
| `Permissions-Policy` | Feature abuse | Unauthorized use of browser features |

**Benefits:**
- Industry-standard security (Netflix, Airbnb, Uber level)
- Automatic application to all routes
- No middleware overhead

### 4. Health Check Monitoring

```json
"rewrites": [
  {
    "source": "/monitoring",
    "destination": "/api/monitoring/health"
  }
]
```

**What This Does:**
- Creates public monitoring endpoint at `/monitoring`
- Maps to internal health check API
- Enables external monitoring services

**Usage:**
```bash
# Check application health
curl https://your-app.vercel.app/monitoring

# Response:
{
  "status": "healthy",
  "timestamp": "2025-01-12T15:33:00.000Z",
  "services": {
    "database": "connected",
    "cache": "connected",
    "auth": "operational"
  }
}
```

### 5. Automated Health Checks (Cron Jobs)

```json
"crons": [
  {
    "path": "/api/monitoring/health",
    "schedule": "*/5 * * * *"
  }
]
```

**What This Does:**
- Runs health check every 5 minutes
- Vercel automatically calls this endpoint
- Logs results to Vercel's system logs

**Schedule Format:** Standard cron syntax
- `*/5 * * * *` = Every 5 minutes
- `0 * * * *` = Every hour
- `0 0 * * *` = Every day at midnight

**Benefits:**
- Proactive monitoring
- Early detection of issues
- No external monitoring service needed (for basic checks)

## How It All Works Together

```mermaid
graph TD
    A[Deploy to Vercel] --> B[vercel.json Processed]
    B --> C[Environment Variables Set]
    B --> D[Security Headers Applied]
    B --> E[Health Endpoint Created]
    B --> F[Cron Jobs Scheduled]
    
    C --> G[Sentry Initialized]
    D --> H[All Routes Protected]
    E --> I[/monitoring Accessible]
    F --> J[Auto Health Checks]
    
    G --> K[Errors Tracked]
    H --> K
    I --> K
    J --> K
    
    K --> L[Production Monitoring]
```

## Setup Instructions

### Step 1: Configure Vercel Secrets

**Via Vercel Dashboard:**
1. Go to Project Settings → Environment Variables
2. Add variables with names matching vercel.json (without `@` prefix)
3. Set visibility to "Production" or "All Environments"

**Via Vercel CLI:**
```bash
vercel secrets add sentry-dsn "https://xxx@xxx.ingest.sentry.io/xxx"
vercel secrets add sentry-org "your-org-name"
vercel secrets add sentry-project "lucidmerged"
vercel secrets add sentry-auth-token "your-auth-token"
```

### Step 2: Deploy

```bash
# vercel.json is automatically used during deployment
npm run build
vercel --prod
```

### Step 3: Verify Configuration

**Check Environment Variables:**
```bash
vercel env ls
```

**Check Security Headers:**
```bash
curl -I https://your-app.vercel.app
```

**Check Health Endpoint:**
```bash
curl https://your-app.vercel.app/monitoring
```

**Check Cron Logs:**
1. Go to Vercel Dashboard
2. Select project → Cron Jobs tab
3. View execution logs

## Integration with Application Code

### Required API Routes

**Health Check Endpoint:**
Create `src/app/api/monitoring/health/route.ts`:

```typescript
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Check critical services
    const dbStatus = await checkDatabase()
    const cacheStatus = await checkCache()
    const authStatus = await checkAuth()

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        cache: cacheStatus,
        auth: authStatus
      }
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'unhealthy', error: error.message },
      { status: 503 }
    )
  }
}
```

### Sentry Integration

**Install Sentry:**
```bash
npm install @sentry/nextjs
```

**Configure Sentry:**
Create `sentry.client.config.ts` and `sentry.server.config.ts`:

```typescript
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT || 'development',
  tracesSampleRate: 1.0,
  enabled: process.env.NODE_ENV === 'production'
})
```

## Advantages of This Approach

### 1. **Single Source of Truth**
- All configuration in one file
- No scattered config files
- Easy to audit and modify

### 2. **Automatic Deployment**
- No post-deployment setup
- Configuration deployed with code
- Version controlled with git

### 3. **Vercel-Optimized**
- Uses Vercel's native features
- No external dependencies for basic monitoring
- Leverages Vercel's global edge network

### 4. **Security by Default**
- Headers applied automatically
- No middleware performance overhead
- Industry-standard protection

### 5. **Cost Effective**
- Built-in cron jobs (no external scheduler)
- Built-in health checks
- Only pay for Sentry (optional)

## Monitoring Stack

### Level 1: Vercel Built-In (Free)
- Cron jobs (health checks)
- Deployment logs
- Function logs
- Analytics

### Level 2: Sentry (Paid, Optional)
- Error tracking
- Performance monitoring
- Source maps
- User context

### Level 3: External (Optional)
- Uptime monitoring (UptimeRobot, Pingdom)
- Log aggregation (LogDNA, Papertrail)
- APM (New Relic, Datadog)

## Environment-Specific Configuration

### Production
```json
{
  "env": {
    "NEXT_PUBLIC_ENVIRONMENT": "production",
    "NEXT_PUBLIC_SENTRY_DSN": "@sentry-dsn"
  }
}
```

### Staging (Optional)
Create `vercel.staging.json`:
```json
{
  "env": {
    "NEXT_PUBLIC_ENVIRONMENT": "staging",
    "NEXT_PUBLIC_SENTRY_DSN": "@sentry-dsn-staging"
  }
}
```

Deploy with:
```bash
vercel --prod --scope=staging
```

## Troubleshooting

### Issue: Secrets Not Found

**Error:** `Error: Environment variable "@sentry-dsn" not found`

**Solution:**
```bash
# Verify secrets exist
vercel secrets ls

# Add missing secret
vercel secrets add sentry-dsn "your-value"

# Redeploy
vercel --prod
```

### Issue: Headers Not Applied

**Check:**
```bash
curl -I https://your-app.vercel.app | grep "X-Frame-Options"
```

**Fix:**
- Ensure vercel.json is in project root
- Check JSON syntax is valid
- Redeploy project

### Issue: Cron Jobs Not Running

**Check:**
1. Go to Vercel Dashboard
2. Project → Cron Jobs tab
3. Verify schedule is correct
4. Check execution logs

**Common Issues:**
- Invalid cron syntax
- Endpoint returns error
- Endpoint takes >10s (timeout)

## Best Practices

### 1. **Use Vercel Secrets for Sensitive Data**
```bash
# ✅ GOOD: Use secrets
vercel secrets add api-key "sensitive-value"

# ❌ BAD: Hardcode in vercel.json
"env": { "API_KEY": "hardcoded-value" }
```

### 2. **Keep Health Checks Fast**
```typescript
// ✅ GOOD: Quick checks
async function checkDatabase() {
  const result = await db.query('SELECT 1')
  return result ? 'connected' : 'disconnected'
}

// ❌ BAD: Heavy operations
async function checkDatabase() {
  const result = await db.query('SELECT * FROM users') // Too slow
  return 'connected'
}
```

### 3. **Use Appropriate Cron Frequency**
```json
// ✅ GOOD: Balance monitoring vs cost
"schedule": "*/5 * * * *"  // Every 5 minutes

// ❌ BAD: Too frequent
"schedule": "* * * * *"    // Every minute (60x cost)
```

### 4. **Log Important Events**
```typescript
export async function GET() {
  console.log('[Health Check] Starting health check')
  
  const status = await performChecks()
  
  console.log('[Health Check] Status:', status)
  
  return NextResponse.json(status)
}
```

## Migration from Other Approaches

### From Separate Config Files

**Before:**
- Multiple config files
- Manual Sentry setup
- Separate middleware for headers

**After:**
- Single vercel.json
- Automatic Sentry config
- Built-in headers

### From Manual Setup

**Before:**
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  response.headers.set('X-Frame-Options', 'DENY')
  // ... more headers
  return response
}
```

**After:**
```json
// vercel.json - automatically applied
"headers": [...]
```

## Summary

The vercel.json approach provides:

✅ **Centralized Configuration** - Single file for all error management
✅ **Automatic Deployment** - Config deployed with code
✅ **Vercel-Native** - Leverages platform features
✅ **Security by Default** - Headers automatically applied
✅ **Cost Effective** - Built-in monitoring features
✅ **Version Controlled** - Git tracks all changes
✅ **Easy to Audit** - One file to review
✅ **Production Ready** - Industry-standard setup

## Next Steps

1. ✅ Configure Vercel secrets
2. ✅ Create health check API route
3. ✅ Deploy to Vercel
4. ✅ Verify headers are applied
5. ✅ Test health monitoring endpoint
6. ✅ Check cron job execution
7. ✅ Integrate Sentry (optional)
8. ✅ Set up external monitoring (optional)

## Related Documentation

- [docs/ERROR_MANAGEMENT_SYSTEM.md](./ERROR_MANAGEMENT_SYSTEM.md) - Complete error management overview
- [docs/DEPLOYMENT_PIPELINE_SETUP.md](./DEPLOYMENT_PIPELINE_SETUP.md) - Full deployment guide
- [Vercel Configuration Docs](https://vercel.com/docs/projects/project-configuration)
- [Sentry Next.js Integration](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
