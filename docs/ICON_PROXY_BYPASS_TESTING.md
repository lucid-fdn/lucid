# Icon Proxy Bypass Testing

## Purpose

Temporarily bypass the Next.js icon proxy to test if icons load directly from the backend. This helps debug whether the issue is:
- ❌ The proxy code
- ❌ The backend being unreachable from Vercel
- ✅ Something else

## How It Works

When enabled, icons will load directly from your backend instead of through Next.js:

**Normal (Proxy):**
```
Browser → /api/lucid-l2/icons/nodes-base/... → Backend
```

**Bypass Mode:**
```
Browser → http://13.221.253.195:3001/api/flow/icon/nodes-base/... (direct)
```

## Setup

### 1. Add Environment Variable

Add to your `.env.local` (for local testing):
```bash
# Bypass icon proxy (for testing only)
NEXT_PUBLIC_BYPASS_ICON_PROXY=true
LUCID_L2_API_URL=http://13.221.253.195:3001/api
```

### 2. For Production Testing (Vercel)

Add via Vercel Dashboard:
1. Go to https://vercel.com/dashboard
2. Select your project
3. Settings → Environment Variables
4. Add:
   - Key: `NEXT_PUBLIC_BYPASS_ICON_PROXY`
   - Value: `true`
   - Environments: ✓ Production (or Preview for testing)
5. Add:
   - Key: `LUCID_L2_API_URL`
   - Value: `http://13.221.253.195:3001/api`
   - Environments: ✓ Production (or Preview for testing)
6. Redeploy

### 3. Check Browser Console

When bypass is active, you'll see:
```
[DEBUG] Bypassing proxy, using direct URL: http://13.221.253.195:3001/api/flow/icon/nodes-base/...
```

## What This Tests

### If Icons Work With Bypass ✅
```
✅ Backend is accessible from browser
✅ Icons exist on backend
✅ CORS is configured correctly
❌ Problem is with the Next.js proxy
```

**Next steps:**
- Check Vercel logs for proxy errors
- Verify `LUCID_L2_API_URL` env var in production
- Check if proxy can reach backend from Vercel servers

### If Icons Still Don't Work ❌
```
❌ Backend not accessible from internet
❌ Firewall blocking requests
❌ CORS not configured
❌ Icons don't exist on backend
```

**Next steps:**
- Check backend server is running
- Check firewall rules allow port 3001
- Configure CORS on backend
- Verify icon paths exist

## Important Notes

### CORS Requirements

For bypass mode to work, your backend MUST have CORS headers:

```javascript
// Backend needs to respond with:
Access-Control-Allow-Origin: *
// OR
Access-Control-Allow-Origin: https://www.lucid.foundation
```

**How to add CORS to n8n:**

If using nginx:
```nginx
location /api/flow/icon {
    proxy_pass http://localhost:3001;
    
    # Add CORS headers
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods "GET, OPTIONS";
}
```

If using n8n directly, check n8n CORS settings or add nginx proxy.

### Security Warning ⚠️

**This mode exposes your backend URL to the browser!**

Do NOT use in production permanently. Only for testing:
- ❌ Exposes backend IP address
- ❌ Exposes backend structure
- ❌ No caching benefits
- ❌ CORS security considerations

**Use only for debugging, then remove the env vars.**

## Testing Checklist

- [ ] Add `NEXT_PUBLIC_BYPASS_ICON_PROXY=true` to env
- [ ] Add `LUCID_L2_API_URL` to env
- [ ] Restart dev server (for local) or redeploy (for production)
- [ ] Open browser console
- [ ] Visit page with icons
- [ ] Check for `[DEBUG] Bypassing proxy` message
- [ ] Check if icons load
- [ ] Check browser network tab for direct requests to backend IP

## Results

### Test 1: Local Development

```bash
# .env.local
NEXT_PUBLIC_BYPASS_ICON_PROXY=true
LUCID_L2_API_URL=http://13.221.253.195:3001/api

# Restart server
npm run dev

# Visit http://localhost:3000
# Check console for [DEBUG] messages
# Check if icons load
```

**If icons load locally with bypass:**
→ Backend is accessible
→ Proxy code has an issue

**If icons don't load locally with bypass:**
→ Backend not accessible from your machine
→ Check firewall/network

### Test 2: Production (Vercel)

```bash
# Add env vars in Vercel Dashboard
NEXT_PUBLIC_BYPASS_ICON_PROXY=true
LUCID_L2_API_URL=http://13.221.253.195:3001/api

# Redeploy
vercel --prod

# Visit https://www.lucid.foundation
# Check browser console
# Check if icons load
```

**If icons load in production with bypass:**
→ Backend is accessible from internet
→ Proxy code or Vercel can't reach backend

**If icons don't load in production with bypass:**
→ Backend not accessible from internet
→ Check firewall rules
→ Check CORS headers

## Cleanup

After testing, REMOVE the bypass env vars:

### Local
```bash
# .env.local
# Remove or comment out:
# NEXT_PUBLIC_BYPASS_ICON_PROXY=true
```

### Production
1. Vercel Dashboard
2. Settings → Environment Variables
3. Delete `NEXT_PUBLIC_BYPASS_ICON_PROXY`
4. Redeploy

## Example Testing Session

```bash
# 1. Enable bypass locally
echo "NEXT_PUBLIC_BYPASS_ICON_PROXY=true" >> .env.local
echo "LUCID_L2_API_URL=http://13.221.253.195:3001/api" >> .env.local

# 2. Restart
npm run dev

# 3. Test
open http://localhost:3000

# 4. Check console (should see [DEBUG] messages)

# 5. Check network tab
# Should see direct requests to: http://13.221.253.195:3001/api/flow/icon/...

# 6. Verify icons load

# 7. Cleanup
# Remove the lines from .env.local
```

## Interpreting Results

| Proxy Mode | Bypass Mode | Diagnosis |
|------------|-------------|-----------|
| ❌ Fails   | ✅ Works    | Proxy code issue or Vercel can't reach backend |
| ❌ Fails   | ❌ Fails    | Backend not accessible or icons missing |
| ✅ Works   | ✅ Works    | No issue (check caching) |
| ✅ Works   | ❌ Fails    | CORS issue (proxy sets headers, direct doesn't) |

## Next Steps Based on Results

### If Bypass Works But Proxy Doesn't

Check Vercel logs for proxy errors:
```bash
vercel logs --prod | grep "Icon Proxy"
```

Look for:
- Connection timeout
- Connection refused  
- DNS errors
- Network errors

### If Neither Works

1. **Check backend is running:**
   ```bash
   curl http://13.221.253.195:3001/api/flow/icon/nodes-base/dist/nodes/Telegram/telegram.svg
   ```

2. **Check firewall:**
   ```bash
   # On backend server
   sudo ufw status
   sudo ufw allow 3001/tcp
   ```

3. **Check CORS:**
   ```bash
   curl -H "Origin: https://www.lucid.foundation" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     http://13.221.253.195:3001/api/flow/icon/nodes-base/dist/nodes/Telegram/telegram.svg
   ```

### If Both Work

The issue might be caching. Clear browser cache and test again.

## Summary

This bypass feature helps you quickly determine:
1. Is the backend accessible?
2. Do the icons exist?
3. Is CORS configured?
4. Is the proxy the problem?

Use it for debugging only, then disable it for production.
