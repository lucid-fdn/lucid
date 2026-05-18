# 🔄 Marketplace API Consolidation - Discovery & Plan

**Date:** January 10, 2025  
**Status:** ⚠️ Duplicate APIs Found - Consolidation Needed

---

## 🔍 Discovery

### Existing APIs Found

The codebase **already has** bookmark and rating APIs:

#### 1. Bookmark API (Existing)
**Path:** `src/app/api/(studio)/bookmark/[assetId]/route.ts`

```typescript
// POST - Bookmark asset
// DELETE - Unbookmark asset  
// GET - Check if bookmarked

Uses:
- requireUserId() from ports/auth
- bookmarkAsset(), unbookmarkAsset(), isBookmarked() from ports/db
- NotificationService for notifications to asset owner
- Works with asset_row_id (internal Supabase ID)
```

#### 2. Rating API (Existing)
**Path:** `src/app/api/(studio)/rate/asset/[assetId]/route.ts`

```typescript
// POST - Rate asset (1-5 stars)
// GET - Get user's rating

Uses:
- requireUserId() from ports/auth
- rateAsset(), getUserRating() from ports/db
- NotificationService for notifications to asset owner
- Works with asset_row_id (internal Supabase ID)
```

### Duplicate APIs Created (v2)

I created duplicate implementations:
- `src/app/api/v2/marketplace/assets/[id]/bookmark/route.ts`
- `src/app/api/v2/marketplace/assets/[id]/rate/route.ts`

**Differences:**
- Use external_id instead of asset_row_id
- Don't follow ports/adapters pattern
- Use different auth pattern (getServerAuth vs requireUserId)
- Different notification approach

---

## 🏗️ Architecture Patterns

### Ports/Adapters Pattern (Existing)

```
src/
├── ports/
│   ├── auth.ts      # Re-exports from lib/auth
│   └── db.ts        # Re-exports from lib/db
├── lib/
│   ├── auth/        # Auth implementations
│   └── db.ts        # Database implementations
└── app/api/
    └── (studio)/    # API routes using ports
```

**Benefits:**
- Easy to swap implementations
- Consistent patterns across codebase
- Testable with mocks
- Clear separation of concerns

### Current v2 Implementation (New)

```
src/
├── lib/
│   └── marketplace/
│       ├── ai-aggregator-client.ts  # External API client
│       └── merger.ts                # Data overlay
└── app/api/v2/
    └── marketplace/
        ├── search/                  # ✅ New, no duplicate
        └── assets/[id]/            # ❌ Duplicates existing
```

---

## 📊 Comparison

| Feature | Existing APIs | v2 APIs |
|---------|--------------|---------|
| **Path** | `/api/(studio)/bookmark/[assetId]` | `/api/v2/marketplace/assets/[id]/bookmark` |
| **ID Type** | asset_row_id (UUID) | external_id (string) |
| **Auth** | `requireUserId()` from ports | `getServerAuth()` direct |
| **DB** | ports/db functions | Direct Supabase calls |
| **Notifications** | `NotificationService.send()` | `createNotification()` |
| **Rate Limiting** | None | checkRateLimit() |
| **Validation** | Basic | Zod schemas |
| **Owner Notification** | ✅ Yes | ✅ Yes |
| **Asset Auto-Create** | ❌ No | ✅ Yes |

---

## ✅ Consolidation Plan

### Option 1: Update Existing APIs (Recommended)

**Extend existing APIs to support both ID types:**

```typescript
// src/app/api/(studio)/bookmark/[assetId]/route.ts

export async function POST(req: NextRequest, context: { params: Params }) {
  const userId = await requireUserId();
  const { assetId } = await context.params;
  
  // NEW: Support both internal UUID and external_id
  let resolvedAssetId = assetId;
  
  if (!assetId.match(/^[0-9a-f-]{36}$/)) {
    // It's an external_id, resolve to asset_row_id
    const { data: asset } = await supabase
      .from('assets')
      .select('asset_row_id')
      .eq('external_id', assetId)
      .single();
    
    if (asset) {
      resolvedAssetId = asset.asset_row_id;
    } else {
      // Auto-create asset stub
      const { data: newAsset } = await supabase
        .from('assets')
        .insert({
          external_id: assetId,
          name: assetId,
          kind: 'MODEL',
          visibility: 'PUBLIC'
        })
        .select('asset_row_id')
        .single();
      
      resolvedAssetId = newAsset.asset_row_id;
    }
  }
  
  // Continue with existing logic using resolvedAssetId
  await bookmarkAsset(userId, resolvedAssetId);
  // ... rest of existing code
}
```

**Pros:**
- ✅ Single source of truth
- ✅ Maintains existing patterns
- ✅ No breaking changes
- ✅ Backward compatible

**Cons:**
- Slightly more complex logic

### Option 2: Keep Both, Document Differences

**Use cases:**
- **Existing API** (`/api/(studio)/bookmark/[assetId]`): Internal app use, known asset_row_ids
- **v2 API** (`/api/v2/marketplace/assets/[id]/bookmark`): External use, external_ids from AI Aggregator

**Pros:**
- ✅ Clear separation of concerns
- ✅ v2 API optimized for AI Aggregator integration
- ✅ No changes to existing code

**Cons:**
- ❌ Code duplication
- ❌ Two paths to maintain
- ❌ Potential confusion

### Option 3: Consolidate to v2, Migrate Existing

**Replace existing APIs with v2 versions, update all callers:**

**Pros:**
- ✅ Modern patterns (rate limiting, validation)
- ✅ Works with external_ids natively
- ✅ Single API surface

**Cons:**
- ❌ Breaking changes
- ❌ Need to update all existing code
- ❌ Loses ports/adapters benefits

---

## 🎯 Recommendation

**Go with Option 1: Update Existing APIs**

1. **Extend existing APIs** to support both ID types
2. **Add rate limiting** to existing APIs
3. **Add Zod validation** to existing APIs
4. **Keep v2 search API** (no duplicate)
5. **Remove v2 bookmark/rate APIs** (duplicates)
6. **Update hooks** to use existing API paths
7. **Update documentation**

### Implementation Steps

1. ✅ **Update** `src/app/api/(studio)/bookmark/[assetId]/route.ts`
   - Add external_id support
   - Add rate limiting
   - Add asset auto-creation

2. ✅ **Update** `src/app/api/(studio)/rate/asset/[assetId]/route.ts`
   - Add external_id support
   - Add rate limiting
   - Add Zod validation
   - Add DELETE method

3. ✅ **Update** `src/hooks/use-marketplace-actions.ts`
   - Change paths to use existing APIs
   - Keep all the React Query logic

4. ✅ **Remove duplicates**
   - Delete `src/app/api/v2/marketplace/assets/[id]/bookmark/route.ts`
   - Delete `src/app/api/v2/marketplace/assets/[id]/rate/route.ts`

5. ✅ **Update merger** (`src/lib/marketplace/merger.ts`)
   - Work with asset_row_id internally
   - Map external_id for responses

6. ✅ **Documentation**
   - Update API docs with enhanced features
   - Document ID type support

---

## 📝 Notes

- The ports/adapters pattern is valuable - we should maintain it
- NotificationService is more sophisticated than basic createNotification
- Rate limiting and validation can be added without changing the pattern
- Backward compatibility is important for existing code

---

## 🚀 Next Actions

1. Pause v2 bookmark/rate implementation
2. Enhance existing APIs with v2 features
3. Update hooks to use enhanced existing APIs
4. Remove duplicate v2 endpoints
5. Update all documentation

This approach gives us the best of both worlds: modern features + existing patterns.
