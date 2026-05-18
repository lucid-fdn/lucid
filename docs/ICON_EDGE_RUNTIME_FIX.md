# Icon Edge Runtime Fix - ACTUAL SOLUTION

## Problem Confirmed

- ✅ Backend is accessible: `http://13.221.253.195:3001` works
- ✅ Environment variables are set
- ✅ Code is correct
- ❌ Production returns: `{"error":"Failed to fetch icon"}`

## Root Cause

The icon proxy API route uses **Edge Runtime**, which has strict security restrictions:

```typescript
// src/app/api/lucid-l2/icons/[...path]/route.ts
export const runtime = 'edge';  // ← This is the problem
```

**Vercel Edge Runtime restrictions:**
- ❌ Cannot make HTTP connections (only HTTPS)
- ❌ Your backend is HTTP: `http://13.221.253.195:3001`
- ✅ Edge can only connect to HTTPS endpoints

## Solution Options

### Option 1: Switch to Node.js Runtime (Quick Fix - 2 minutes)

Change the icon proxy route to use Node.js runtime instead of Edge:

```typescript
// src/app/api/lucid-l2/icons/[...path]/route.ts

// REMOVE this line:
// export const runtime = 'edge';

// CHANGE to:
export const runtime = 'nodejs';

// Or simply remove the runtime export to use default Node.js runtime
```

**Changes needed:**

1. Remove or change `export const runtime = 'edge'` to `'nodejs'`
2. Deploy to Vercel
3. Icons will work immediately

**Trade-offs:**
- ✅ Works with HTTP backends
- ✅ More flexible (can make any outbound connection)
- ⚠️ Slightly slower cold starts (~100-200ms vs Edge's ~0-50ms)
- ⚠️ Higher costs (but negligible for your use case)

### Option 2: Add HTTPS to Backend (Secure - 30 minutes)

Set up SSL certificate on your backend server:

1. **Get SSL Certificate (Let's Encrypt - Free):**
   ```bash
   # On your backend server (13.221.253.195)
   sudo apt-get update
   sudo apt-get install certbot
   
   # Get certificate for your domain
   sudo certbot certonly --standalone -d api.lucid.foundation
   ```

2. **Configure n8n with HTTPS:**
   ```bash
   # Edit n8n configuration
   export N8N_PROTOCOL=https
   export N8N_SSL_KEY=/etc/letsencrypt/live/api.lucid.foundation/privkey.pem
   export N8N_SSL_CERT=/etc/letsencrypt/live/api.lucid.foundation/fullchain.pem
   
   # Restart n8n
   ```

3. **Update environment variable:**
   ```
   LUCID_L2_API_URL=https://api.lucid.foundation:3001/api
   ```

4. **Point DNS:**
   - Add A record: `api.lucid.foundation` → `13.221.253.195`

**Trade-offs:**
- ✅ More secure (encrypted connections)
- ✅ Can use Edge runtime (fastest)
- ✅ Production best practice
- ⚠️ Requires domain and DNS setup
- ⚠️ Requires SSL certificate management

### Option 3: Use Nginx Reverse Proxy with SSL (Best Practice)

Set up Nginx as a reverse proxy with SSL:

1. **Install Nginx:**
   ```bash
   sudo apt-get install nginx
   ```

2. **Get SSL Certificate:**
   ```bash
   sudo certbot --nginx -d api.lucid.foundation
   ```

3. **Configure Nginx:**
   ```nginx
   # /etc/nginx/sites-available/lucid-l2
   server {
       listen 443 ssl http2;
       server_name api.lucid.foundation;
       
       ssl_certificate /etc/letsencrypt/live/api.lucid.foundation/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/api.lucid.foundation/privkey.pem;
       
       location / {
           proxy_pass http://localhost:3001;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

4. **Update environment variable:**
   ```
   LUCID_L2_API_URL=https://api.lucid.foundation/api
   ```

**Trade-offs:**
- ✅ Most secure and production-ready
- ✅ Can use Edge runtime
- ✅ Handles SSL termination
- ✅ Can add rate limiting, caching, etc.
- ⚠️ More complex setup

## Recommended Solution: Option 1 (Node.js Runtime)

For immediate fix with minimal changes:

### Step 1: Update Icon Proxy Route

```typescript
// src/app/api/lucid-l2/icons/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';

// CHANGE THIS LINE:
export const runtime = 'nodejs';  // Changed from 'edge' to 'nodejs'
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const iconPath = params.path.join('/');
    
    if (!iconPath) {
      return NextResponse.json(
        { error: 'Icon path is required' },
        { status: 400 }
      );
    }

    // Get Lucid-L2 URL from environment (server-side only)
    const baseUrl = process.env.LUCID_L2_API_URL || 'http://localhost:3001/api';
    const serverUrl = baseUrl.replace(/\/api\/?$/, '');
    
    // Construct icon URL
    const iconUrl = `${serverUrl}/api/flow/icon/${iconPath}`;
    
    console.log('[Icon Proxy] Fetching:', iconUrl);

    // Fetch from Lucid-L2
    const response = await fetch(iconUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'LucidMerged/1.0',
      },
    });

    if (!response.ok) {
      console.error('[Icon Proxy] Failed:', response.status);
      return new NextResponse(null, { status: 404 });
    }

    const iconData = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/svg+xml';

    // Return with aggressive caching (icons don't change)
    return new NextResponse(iconData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    console.error('[Icon Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch icon' },
      { status: 500 }
    );
  }
}
```

### Step 2: Commit and Deploy

```bash
git add src/app/api/lucid-l2/icons/[...path]/route.ts
git commit -m "Fix: Switch icon proxy to Node.js runtime for HTTP backend support"
git push origin main
```

### Step 3: Verify

After deployment completes (2-3 minutes):

```bash
# Test icon URL
curl https://www.lucid.foundation/api/lucid-l2/icons/nodes-base/dist/nodes/Twilio/twilio.svg

# Should return SVG content (not error)
```

## Why Edge Runtime Failed

**Vercel Edge Runtime security policy:**
- Runs on Cloudflare Workers / Vercel Edge Network
- Restricted environment for security
- Only allows HTTPS outbound connections
- Blocks HTTP for security (prevents man-in-the-middle attacks)

**Node.js Runtime:**
- Runs on AWS Lambda
- More permissive environment
- Allows both HTTP and HTTPS
- Full Node.js API available

## Performance Impact

**Edge Runtime:**
- Cold start: 0-50ms
- Execution time: 1-10ms
- Global edges (low latency worldwide)

**Node.js Runtime:**
- Cold start: 100-300ms (first request)
- Warm: 10-50ms (subsequent requests)
- Single region (slightly higher latency far from region)

**For icon serving:** Node.js runtime is fine because:
- Icons are cached aggressively (1 year)
- After first load, served from browser/CDN cache
- Cold start only happens once per icon per user
- 100-200ms difference is negligible for static assets

## Future: Move to HTTPS Backend

Once you have time, migrate to HTTPS backend:

1. Set up domain: `api.lucid.foundation`
2. Add SSL certificate (Let's Encrypt free)
3. Switch back to Edge runtime for max performance
4. Update `LUCID_L2_API_URL` to use `https://`

This will give you:
- Maximum performance (Edge runtime)
- Better security (encrypted connections)
- Production best practices

## Summary

**Immediate fix (2 minutes):**
1. Change `export const runtime = 'edge'` to `'nodejs'` in icon proxy route
2. Commit and push
3. Wait for deployment
4. Icons will work

**Long-term (when you have time):**
1. Set up HTTPS on backend with SSL certificate
2. Switch back to Edge runtime
3. Get maximum performance + security

The Node.js runtime fix will work perfectly fine for now and you can optimize later when convenient.
