# Privy Security Configuration

## Overview

This document describes the security headers configured for Privy production deployment in `next.config.mjs`.

**Reference:** https://docs.privy.io/security/implementation-guide/content-security-policy

## Security Headers Implemented

### 1. Content Security Policy (CSP)

The CSP is configured to protect the Privy embedded wallet iframe while allowing necessary functionality.

#### Directives Breakdown

| Directive | Value | Purpose |
|-----------|-------|---------|
| `default-src` | `'self'` | Default fallback for all content types |
| `script-src` | `'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com` | Scripts from same origin + Cloudflare Turnstile |
| `style-src` | `'self' 'unsafe-inline'` | Styles for styled-components/Tailwind |
| `img-src` | `'self' data: blob: https://cdn.sanity.io https://*.dicebear.com...` | Images from various sources |
| `font-src` | `'self' data:` | Fonts from same origin |
| `object-src` | `'none'` | Disable plugins (Flash, Java, etc.) |
| `base-uri` | `'self'` | Prevent base tag injection |
| `form-action` | `'self'` | Form submissions only to same origin |
| `frame-ancestors` | `'none'` | **CRITICAL: Prevents your site from being embedded** |
| `child-src` | Privy + WalletConnect domains | Allowed child frame sources |
| `frame-src` | Privy + WalletConnect + Cloudflare | Allowed iframe sources |
| `connect-src` | Multiple API endpoints | Allowed fetch/WebSocket connections |
| `worker-src` | `'self' blob:` | Service/Web workers |
| `manifest-src` | `'self'` | Web app manifests |

#### Frame Sources (Critical for Privy)

```
child-src:
  - https://auth.privy.io          # Privy embedded wallet iframe
  - https://verify.walletconnect.com
  - https://verify.walletconnect.org

frame-src:
  - https://auth.privy.io          # Privy authentication iframe
  - https://verify.walletconnect.com
  - https://verify.walletconnect.org
  - https://challenges.cloudflare.com  # Turnstile CAPTCHA
```

#### Connect Sources (API Whitelist)

```
Privy & WalletConnect:
  - https://auth.privy.io
  - wss://relay.walletconnect.com
  - wss://relay.walletconnect.org
  - wss://www.walletlink.org          # Coinbase Wallet
  - https://*.rpc.privy.systems
  - https://explorer-api.walletconnect.com

Database & Realtime:
  - https://*.supabase.co
  - wss://*.supabase.co

Blockchain RPCs:
  - https://api.mainnet-beta.solana.com
  - https://api.devnet.solana.com
  - https://api.testnet.solana.com

Payments:
  - https://api.stripe.com
  - https://commerce.coinbase.com
  - https://api.commerce.coinbase.com

Monitoring:
  - https://*.sentry.io

Integrations:
  - https://api.lucid.foundation
  - https://*.nango.dev
```

### 2. X-Frame-Options

```
X-Frame-Options: DENY
```

**Purpose:** Prevents your site from being embedded in iframes on other sites (clickjacking protection).

**Note:** `frame-ancestors 'none'` in CSP provides the same protection but X-Frame-Options ensures backwards compatibility with older browsers.

### 3. X-Content-Type-Options

```
X-Content-Type-Options: nosniff
```

**Purpose:** Prevents browsers from MIME-type sniffing, forcing them to use the declared Content-Type.

### 4. Referrer-Policy

```
Referrer-Policy: strict-origin-when-cross-origin
```

**Purpose:** Controls how much referrer information is included with requests:
- Same-origin: Full URL
- Cross-origin (HTTPS→HTTPS): Origin only
- Cross-origin (HTTPS→HTTP): No referrer

### 5. Permissions-Policy

```
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

**Purpose:** Disables access to sensitive browser APIs that aren't needed by the application.

## Privy Dashboard Configuration

### Allowed Origins (CRITICAL)

In the Privy Dashboard (https://dashboard.privy.io), add these allowed origins:

**Production:**
```
https://lucid.foundation
https://www.lucid.foundation
```

**Development:**
```
http://localhost:3000
```

**Preview/Staging (if using Vercel):**
```
https://*.vercel.app
```

**Steps:**
1. Go to https://dashboard.privy.io
2. Select your app
3. Navigate to **Settings** → **Domains**
4. Add each origin to "Allowed origins"
5. Save changes

⚠️ **Without this configuration, Privy will reject authentication requests from non-whitelisted domains!**

## Privy Production Checklist

From [Privy Security Checklist](https://docs.privy.io/security/implementation-guide/security-checklist):

### Code Configuration (next.config.mjs)
- [x] **Content Security Policy (CSP)** - Configured with Privy-required domains
- [x] **Frame protection** - `frame-ancestors 'none'` + `X-Frame-Options: DENY`
- [x] **Privy iframe sources** - `frame-src` and `child-src` include `auth.privy.io`
- [x] **WalletConnect support** - `verify.walletconnect.com/.org` in frame sources
- [x] **Cloudflare Turnstile** - `challenges.cloudflare.com` in frame/script sources
- [x] **API connections** - `connect-src` includes all required endpoints

### Dashboard Configuration (dashboard.privy.io)
- [ ] **Allowed origins** - Add production domains (`https://lucid.foundation`, `https://www.lucid.foundation`)
- [ ] **Allowed origins** - Add development domain (`http://localhost:3000`)
- [ ] **Allowed origins** - Add preview domains if needed (`https://*.vercel.app`)

## Adding New Services

When adding a new external service, update the appropriate CSP directive:

### API Endpoint
Add to `connect-src` array in `next.config.mjs`:
```javascript
"https://api.new-service.com",    // New Service API
```

### External Script
Add to `script-src`:
```javascript
"script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://new-service.com",
```

### External Images
Add to `img-src`:
```javascript
"img-src 'self' data: blob: https://cdn.sanity.io ... https://images.new-service.com",
```

### Embedded iFrame
Add to both `frame-src` and `child-src`:
```javascript
"child-src https://auth.privy.io ... https://embed.new-service.com",
"frame-src https://auth.privy.io ... https://embed.new-service.com",
```

## Testing Security Headers

### Browser DevTools
1. Open DevTools → Network tab
2. Refresh the page
3. Click on the main document request
4. Check Response Headers for:
   - `Content-Security-Policy`
   - `X-Frame-Options`
   - `X-Content-Type-Options`
   - `Referrer-Policy`
   - `Permissions-Policy`

### Online Tools
- [Security Headers](https://securityheaders.com/) - Grades your headers
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/) - Analyzes CSP policy

### CSP Violation Debugging
If something breaks after deploying, check browser console for CSP violations:
```
Refused to load the script 'https://example.com/script.js' because it violates the following Content Security Policy directive: "script-src 'self'..."
```

Add the domain to the appropriate directive to fix.

## Troubleshooting

### Privy Login Not Working
1. Check `frame-src` includes `https://auth.privy.io`
2. Check `child-src` includes `https://auth.privy.io`
3. Check `connect-src` includes `https://auth.privy.io`

### WalletConnect Not Working
1. Check `frame-src` includes WalletConnect domains
2. Check `connect-src` includes WebSocket URLs (`wss://relay.walletconnect.com`)

### Images Not Loading
1. Check `img-src` includes the image host domain
2. For data URIs: ensure `data:` is in `img-src`
3. For blob URLs: ensure `blob:` is in `img-src`

### API Calls Failing
1. Check browser console for CSP violations
2. Add the API domain to `connect-src`
3. For WebSockets, ensure `wss://` prefix is used

## Security Best Practices

1. **Never use `unsafe-inline` for scripts in production** if possible
   - We use it for Next.js compatibility, but remove if you can use nonces

2. **Regularly audit CSP violations**
   - Set up reporting: `report-uri /api/csp-report`
   - Review and either fix code or add legitimate domains

3. **Use Report-Only mode when testing**
   - `Content-Security-Policy-Report-Only` header tests without blocking

4. **Keep dependencies updated**
   - Privy may add new domains, check their docs periodically

## Related Documentation

- [Privy CSP Guide](https://docs.privy.io/security/implementation-guide/content-security-policy)
- [Privy Security Checklist](https://docs.privy.io/security/implementation-guide/security-checklist)
- [MDN CSP Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [OWASP Security Headers](https://owasp.org/www-project-secure-headers/)
