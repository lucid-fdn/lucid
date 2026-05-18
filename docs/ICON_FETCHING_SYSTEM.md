# Icon Fetching System Architecture

## Overview

The homepage carousel icon fetching system is a multi-layered architecture that handles icon display with theme support, proxying, caching, and graceful fallbacks.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Homepage (src/app/(marketing)/page.tsx)                  │
│    - Fetches connectors via getAssets()                     │
│    - Passes to <ConnectorMarquee>                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│ 2. ConnectorMarquee (components/marketplace/connector-      │
│    marquee/index.tsx)                                       │
│    - Client component, handles theme switching              │
│    - Passes icon_url & icon_url_dark to LogoCloud          │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│ 3. LogoCloud (components/ui/logo-cloud.tsx)                │
│    - Displays icon with Next.js Image                       │
│    - Has onError fallback handler                           │
│    - Shows first 2 letters if icon fails                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Requests icon from proxied URL
                        │
┌───────────────────────▼─────────────────────────────────────┐
│ 4. Icon Proxy API (app/api/lucid-l2/icons/[...path]/       │
│    route.ts)                                                │
│    - Proxies requests to Lucid-L2 backend                   │
│    - Pattern: /api/lucid-l2/icons/{path}                    │
│    - Returns with aggressive caching (1 year immutable)     │
│    - Returns 404 on failure                                 │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Fetches from backend
                        │
┌───────────────────────▼─────────────────────────────────────┐
│ 5. Lucid-L2 Backend                                         │
│    - Endpoint: {LUCID_L2_API_URL}/flow/icon/{path}          │
│    - Serves n8n node icons (847 nodes)                      │
│    - Pattern: nodes-base/dist/nodes/{Node}/{icon}.svg       │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Asset Fetching

**File:** `src/lib/marketplace/marketplace-service.ts`

```typescript
// Homepage calls:
const connectorsData = await getAssets({ 
  ids: CURATED_SECTIONS.topConnectors.ids,
  limit: CURATED_SECTIONS.topConnectors.limit 
});

// This goes through:
MarketplaceService → SearchOrchestrator → LucidL2Adapter
```

### 2. Icon URL Normalization

**File:** `src/lib/api/normalizers.ts`

The `normalizeIconVariants()` function processes icon URLs:

```typescript
export function normalizeIconVariants(data: any): IconVariants {
  // Handles multiple formats:
  // 1. String URLs: "nodes-base/dist/nodes/Github/github.svg"
  // 2. n8n object format: { light: "...", dark: "..." }
  
  // Transforms relative paths through proxy:
  // Input:  "nodes-base/dist/nodes/Github/github.svg"
  // Output: "/api/lucid-l2/icons/nodes-base/dist/nodes/Github/github.svg"
  
  return {
    light: processIconPath(lightUrl),
    dark: processIconPath(darkUrl) || undefined
  };
}
```

**Key behaviors:**
- **Relative paths** (n8n icons): Proxied through `/api/lucid-l2/icons/`
- **Absolute URLs**: Returned as-is (external logos)
- **Dark variant**: Only used when explicitly provided (no auto-generation)

### 3. Component Display

**File:** `src/components/marketplace/connector-marquee/index.tsx`

```typescript
<LogoCloud
  key={connector.id}
  name={connector.name}
  iconUrl={connector.icon_url}      // Light mode icon
  iconUrlDark={connector.icon_url_dark} // Dark mode icon (optional)
  isDark={isDark}                   // Theme state
  size="lg"
  showLabel
/>
```

**File:** `src/components/ui/logo-cloud.tsx`

```typescript
// Theme-aware icon selection
const selectedIcon = isDark 
  ? (iconUrlDark || iconUrl)  // Use dark if available, fallback to light
  : iconUrl;                   // Always use light in light mode

// Image with error handling
<Image 
  src={selectedIcon} 
  alt={name}
  fill
  className="object-contain"
  onError={(e) => {
    // Hide image, show fallback
    e.currentTarget.style.display = 'none';
    showFallbackInitials();
  }}
/>

// Fallback: First 2 letters
<div className="fallback-icon" style={{ display: 'none' }}>
  {name.substring(0, 2).toUpperCase()}
</div>
```

### 4. Icon Proxy API

**File:** `src/app/api/lucid-l2/icons/[...path]/route.ts`

```typescript
export async function GET(request: NextRequest, { params }) {
  const iconPath = params.path.join('/');
  
  // Construct backend URL
  const iconUrl = `${LUCID_L2_API_URL}/flow/icon/${iconPath}`;
  
  // Fetch from backend
  const response = await fetch(iconUrl, {
    signal: AbortSignal.timeout(10000),
  });
  
  if (!response.ok) {
    return new NextResponse(null, { status: 404 });
  }
  
  // Return with aggressive caching (icons never change)
  return new NextResponse(iconData, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable', // 1 year
    },
  });
}
```

## Example Icon URL Flow

**For GitHub connector:**

1. **Backend stores:**
   ```
   nodes-base/dist/nodes/Github/github.svg
   ```

2. **Normalizer transforms to:**
   ```
   /api/lucid-l2/icons/nodes-base/dist/nodes/Github/github.svg
   ```

3. **Dark variant (if exists):**
   ```
   /api/lucid-l2/icons/nodes-base/dist/nodes/Github/github.dark.svg
   ```

4. **Browser requests:**
   ```
   http://localhost:3000/api/lucid-l2/icons/nodes-base/dist/nodes/Github/github.dark.svg
   ```

5. **API proxies to:**
   ```
   http://54.204.114.86:3001/api/flow/icon/nodes-base/dist/nodes/Github/github.dark.svg
   ```

## Error Handling & Fallbacks

### 1. API Route Level
- **Timeout:** 10 seconds
- **Failed fetch:** Returns 404
- **Logs errors** to console for monitoring

### 2. Component Level (LogoCloud)
- **Image onError handler:**
  - Hides broken image
  - Shows fallback initials
- **No icon URL:** Shows initials immediately
- **Fallback display:** First 2 letters uppercase

### 3. Service Layer (LucidL2Adapter)
```typescript
try {
  const response = await client.getAvailableNodes();
  nodes = response.nodes;
} catch (error) {
  console.warn('[lucid-l2-adapter] API unavailable, using demo nodes');
  nodes = []; // Graceful degradation
}
```

## Rendering Pattern

**HTML output from homepage:**
```html
<div class="group relative flex-shrink-0 w-20 h-20 p-3 rounded-lg overflow-hidden 
     bg-[#22262A] transition-all hover:shadow-lg flex items-center justify-center">
  
  <!-- Icon with Next.js Image optimization -->
  <div class="w-full h-full flex items-center justify-center relative">
    <img 
      alt="GitHub" 
      loading="lazy" 
      decoding="async"
      class="object-contain" 
      src="http://localhost:3000/api/lucid-l2/icons/nodes-base/dist/nodes/Github/github.dark.svg"
      style="position: absolute; height: 100%; width: 100%; inset: 0px;"
    >
    
    <!-- Fallback (hidden unless icon fails) -->
    <div class="fallback-icon text-xl font-bold text-foreground/80" 
         style="display: none;">
      GI
    </div>
  </div>
  
  <!-- Hover label -->
  <div class="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded 
       bg-popover border shadow-md text-xs text-popover-foreground 
       whitespace-nowrap opacity-0 group-hover:opacity-100 transition-120 
       pointer-events-none z-10">
    GitHub
  </div>
</div>
```

## Performance Optimizations

### 1. Caching Strategy
- **Browser:** 1 year immutable cache (`max-age=31536000, immutable`)
- **CDN:** Can cache icons permanently
- **Redis:** Search results cached for 5 minutes (includes icon URLs)

### 2. Image Loading
- **Next.js Image component:** Automatic optimization
- **Lazy loading:** `loading="lazy"`
- **Async decoding:** `decoding="async"`

### 3. Network Efficiency
- **Single proxy endpoint:** Centralizes icon serving
- **Parallel fetches:** All icons load simultaneously
- **Edge runtime:** Icon proxy runs on edge for low latency

## Theme Support

### Light/Dark Mode Switching
```typescript
// ConnectorMarquee component
const { resolvedTheme } = useTheme();
const isDark = mounted && resolvedTheme === 'dark';

// Passed to LogoCloud
<LogoCloud isDark={isDark} />

// LogoCloud selects appropriate variant
const selectedIcon = isDark 
  ? (iconUrlDark || iconUrl)  // Dark mode: prefer dark, fallback to light
  : iconUrl;                   // Light mode: always light
```

## Known Limitations & Considerations

### 1. Dark Variant Availability
- **Issue:** Not all n8n nodes provide `.dark.svg` variants
- **Solution:** Fallback to light icon if dark not available
- **Previous approach:** Auto-generated dark path (caused 404s)
- **Current approach:** Only use dark when explicitly provided

### 2. Icon Proxy Dependency
- **Issue:** Requires Lucid-L2 backend to be running
- **Solution:** Graceful degradation with demo nodes
- **Fallback:** Shows initials if icon fetch fails

### 3. CORS & Security
- **Benefit:** Proxy hides backend URL from client
- **Benefit:** Centralized authentication (future)
- **Benefit:** Better monitoring and logging

## Future Improvements

### 1. CDN Integration
```typescript
// Store icons on CDN after first fetch
if (response.ok) {
  await uploadToCDN(iconData, iconPath);
  return cdnUrl;
}
```

### 2. Preloading Critical Icons
```typescript
// Preload homepage carousel icons
<link rel="preload" as="image" href="/api/lucid-l2/icons/..." />
```

### 3. Icon Sprite Sheet
```typescript
// Combine frequently used icons into sprite sheet
// Reduces HTTP requests from 50+ to 1
<svg><use href="icons.svg#github" /></svg>
```

### 4. Progressive Enhancement
```typescript
// Show placeholder → Load low-res → Load high-res
<Image
  src={iconUrl}
  placeholder="blur"
  blurDataURL={generateBlurDataURL(name)}
/>
```

## Debugging

### Check icon URL in browser:
```bash
# Direct API test
curl http://localhost:3000/api/lucid-l2/icons/nodes-base/dist/nodes/Github/github.svg

# Check backend
curl http://54.204.114.86:3001/api/flow/icon/nodes-base/dist/nodes/Github/github.svg
```

### Check normalizer output:
```typescript
// In LucidL2Adapter
console.log('[lucid-l2-adapter] Icon variants:', 
  normalizeIconVariants(node)
);
```

### Check component rendering:
```typescript
// In LogoCloud
console.log('[LogoCloud] Rendering:', {
  name,
  iconUrl,
  iconUrlDark,
  isDark,
  selectedIcon
});
```

## Related Files

### Core Icon System
- `src/app/api/lucid-l2/icons/[...path]/route.ts` - Icon proxy API
- `src/components/ui/logo-cloud.tsx` - Icon display component
- `src/lib/api/normalizers.ts` - Icon URL processing

### Integration Points
- `src/components/marketplace/connector-marquee/index.tsx` - Homepage carousel
- `src/lib/search/adapters/lucid-l2-adapter.ts` - Fetches & normalizes icons
- `src/lib/marketplace/marketplace-service.ts` - Service layer

### Configuration
- `.env.local` - `LUCID_L2_API_URL` (backend URL)
- `next.config.mjs` - Image optimization settings

## Best Practices

1. **Always use normalizeIconVariants()** - Don't directly access icon URLs
2. **Provide fallback content** - Name initials as last resort
3. **Handle theme switching** - Support both light and dark variants
4. **Cache aggressively** - Icons rarely change
5. **Log errors** - Monitor icon fetch failures
6. **Test both modes** - Verify light and dark theme support
7. **Graceful degradation** - App works even if icons fail

## Summary

The icon fetching system is a robust, production-ready architecture that:
- ✅ Proxies icons through Next.js for security and caching
- ✅ Supports light/dark theme variants
- ✅ Has multiple fallback layers (dark→light→initials)
- ✅ Caches aggressively (1 year immutable)
- ✅ Handles errors gracefully (never crashes)
- ✅ Optimized for performance (lazy loading, edge runtime)
- ✅ Industry standard pattern (Netflix, Spotify, Airbnb)
