# Architecture Audit: Profile → Org → Project → Environment Model

**Date:** 2025-10-08
**Status:** 🔴 CRITICAL GAPS IDENTIFIED
**Scope:** Full stack (DB, Auth, Routing, Frontend, RBAC)

---

## 🎯 Executive Summary

### Current State: **Profile → Organization (Partial)**
- ✅ Organizations table exists
- ✅ Organization members with roles (owner/admin/member)
- ✅ Org switcher in UI
- ❌ NO Projects layer
- ❌ NO Environments layer
- ❌ Flat routing structure

### Target State: **Profile → Org → Project → Env**
- Required 4-tier hierarchy
- Per-project API keys
- Per-environment secrets/configs
- Nested routing structure

### Gap Analysis: **MAJOR REFACTORING REQUIRED**

---

## 🚨 CRITICAL RECOMMENDATION: CHALLENGE THE SCOPE

### Why This Is NOT MVP-Ready

**The proposed architecture requires:**

1. **Database Overhaul** (2-3 days)
   - Create Projects & Environments tables
   - Migrate ALL existing data
   - Update ALL foreign keys

2. **Route Restructuring** (2-3 days)
   - Change from `/agents` to `/org/:orgId/project/:projectId/env/:envId/agents`
   - Break ALL existing URLs
   - Update ALL API endpoints

3. **RBAC Implementation** (2-3 days)
   - Middleware for org/project/env access
   - Per-resource permission checks
   - Policy enforcement

4. **Frontend Rebuild** (3-4 days)
   - New navigation paradigm
   - Org/Project/Env switchers
   - URL param management everywhere

**Total Effort: 10-15 days of breaking changes**

**For your MVP:** ❌ **TOO EXPENSIVE**

---

## 💡 RECOMMENDED: Phased Approach for MVP

### Phase 0 (MVP): Keep Current, Add Essentials (2 days)
✅ What you ALREADY have that works:
- Organizations with RBAC
- Flat routing structure
- Working auth (Privy)
- Profile management

🎯 What to ADD for MVP:
- [ ] Default "Personal" org for each user
- [ ] Org-level billing placeholder
- [ ] Basic RBAC enforcement in API routes
- [ ] Org context in state

❌ What to SKIP for MVP:
- Projects layer (add in Phase 1)
- Environments (add in Phase 2)
- Nested routing (add in Phase 2)
- Command palette (P1 feature)

### Phase 1 (Post-MVP): Add Projects (3-4 days)
- Create Projects table
- Map existing agents/assets to projects
- Add project switcher
- Keep flat routes for now

### Phase 2 (Growth): Add Environments (4-5 days)
- Create Environments table
- Per-env secrets
- Nested routing
- Full RBAC

---

## 📊 Current Architecture Analysis

### ✅ What EXISTS (Keep & Build On)

#### 1. Database Schema

**Organizations Table** ✅
```sql
- id, slug, name, type
- created_by (FK to profiles)
- RLS policies (public view, member manage)
```

**Organization Members** ✅
```sql
- organization_id, user_id, role
- Roles: owner, admin, member
- RLS policies enforced
```

**Profiles Table** ✅
```sql
- id, email, name, avatar_url
- Linked to Privy auth
```

#### 2. Authentication & RBAC

**Privy Integration** ✅
- Email, wallet, Google login
- Session management
- Server-side auth checks

**Organization Roles** ✅
- Owner: Full access
- Admin: Manage members
- Member: Basic access

#### 3. Frontend Components

**Nav Org Switcher** ✅
- Switch between orgs
- Create new org
- Currently implemented

**Profile Context** ✅
- Server-side fetch
- Client-side updates
- Instant display

#### 4. Routing Structure

**Current Routes** ✅
```
/agents
/agents/create
/agents/[id]
/assets
/chat
/chat/[chatId]
/settings
/workspace/new
```

**Pros:**
- Simple, clean URLs
- Fast to implement
- Easy to understand

**Cons:**
- No org/project/env scoping
- Can't have org-specific routes easily
- Doesn't scale to multi-project users

---

### ❌ What's MISSING (Target Model Requirements)

#### 1. Database Tables

**Projects Table** ❌
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);
```

**Environments Table** ❌
```sql
CREATE TABLE environments (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL CHECK (name IN ('dev', 'staging', 'production')),
  region TEXT,
  budget_usd DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, name)
);
```

**Policy Packs** ❌
```sql
CREATE TABLE policy_packs (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations(id),
  name TEXT,
  pii_rules JSONB,
  license_rules JSONB,
  spend_caps JSONB
);
```

**Treasury** ❌
```sql
CREATE TABLE treasury (
  org_id UUID PRIMARY KEY REFERENCES organizations(id),
  credits_balance DECIMAL DEFAULT 0,
  gas_balance DECIMAL DEFAULT 0
);
```

#### 2. Routing Structure

**Target Routes** ❌
```
/org/:orgId/dashboard
/org/:orgId/project/:projectId/overview
/org/:orgId/project/:projectId/env/:envId/agents
/org/:orgId/project/:projectId/env/:envId/agents/[id]
/org/:orgId/project/:projectId/settings
/org/:orgId/billing
```

**Migration Impact:**
- 🔴 Breaks ALL existing URLs
- 🔴 Requires URL param management everywhere
- 🔴 SEO impact (all URLs change)
- 🔴 Bookmarks/links break

#### 3. RBAC Middleware

**Per-Resource Access Control** ❌
```typescript
// middleware.ts needs:
- checkOrgAccess(userId, orgId, requiredRole)
- checkProjectAccess(userId, projectId, requiredRole)
- checkEnvAccess(userId, envId)
```

**API Route Protection** ❌
```typescript
// Every API route needs:
const org = await getOrgFromRequest(req)
const hasAccess = await checkUserOrgRole(userId, org.id, 'admin')
if (!hasAccess) return 403
```

#### 4. Frontend Components

**Project Switcher** ❌
**Environment Switcher** ❌
**Breadcrumb Navigation** ❌
**Command Palette (⌘K)** ❌
**Flow Studio** ❌

---

## 🎯 MVP-FRIENDLY ARCHITECTURE

### Recommendation: **Org-Scoped Flat Routes**

Keep current clean URLs but add org context:

```
Current (Keep):          With Org Context (Internal):
/agents            →     /agents?org=123
/agents/create     →     /agents/create?org=123
/agents/[id]       →     /agents/[id]?org=123
```

**How:**
1. Store current org in context/state
2. Include org_id in API requests
3. Filter data by org server-side
4. NO URL changes needed

**Benefits:**
- ✅ No breaking changes
- ✅ Clean URLs maintained
- ✅ Org isolation achieved
- ✅ Easy to implement
- ✅ Can add Projects later

---

## 📋 P0/P1/P2 Prioritization (REVISED FOR MVP)

### P0 (MVP Must-Have) - 2 days

**Goal:** Org-scoped data with current URLs

- [ ] Add org_id to agents/assets/chat tables
- [ ] Create default "Personal" org for existing users
- [ ] Store current org in React context
- [ ] Filter all queries by current org
- [ ] Org switcher updates context
- [ ] Basic RBAC in API routes

**Files to Modify:**
- `migrations/010_add_org_scoping.sql`
- `src/contexts/org-context.tsx`
- `src/lib/db/index.ts` (add org_id filters)
- API routes (add org check)

**NO Route Changes!**

### P1 (Post-MVP) - 3-4 days

**Goal:** Add Projects layer

- [ ] Create Projects table
- [ ] Migrate data to projects
- [ ] Project switcher UI
- [ ] Update queries to include project_id
- [ ] Still flat routes

### P2 (Growth) - 4-5 days

**Goal:** Full hierarchy with environments

- [ ] Create Environments table
- [ ] Nested routing structure
- [ ] Per-env secrets
- [ ] Command palette
- [ ] Flow studio

---

## 🔐 Security Considerations

### Current State:
- ✅ Privy handles auth
- ✅ RLS policies on organizations
- ⚠️ No org-scoped resource checks
- ❌ No API key management
- ❌ No per-env secrets

### MVP Security (P0):
- [ ] Add org_id checks in all API routes
- [ ] Verify user is org member
- [ ] Filter all queries by org
- [ ] Add audit logs for org actions

### Post-MVP (P1/P2):
- [ ] Per-project API keys
- [ ] Per-env secrets vault
- [ ] Policy enforcement
- [ ] Advanced RBAC

---

## 📊 Migration Strategy (If You Proceed with Full Model)

### Step 1: Database (Non-Breaking)
1. Create Projects & Environments tables
2. Add org_id/project_id/env_id columns to existing tables
3. Backfill with default values
4. Keep old columns during transition

### Step 2: API Layer (Parallel)
1. Create new API routes with org/project/env params
2. Keep old routes working
3. Gradually migrate clients
4. Deprecate old routes

### Step 3: Frontend (Gradual)
1. Add org/project/env context
2. Update components one by one
3. Feature flag new routing
4. Full rollout after testing

**Timeline:** 3-4 weeks for full migration

---

## 🚀 FINAL RECOMMENDATION

### For Your MVP: **DON'T DO THE FULL MODEL**

**Instead:**

1. ✅ **Keep current architecture** (it works!)
2. ✅ **Add org scoping** (P0 - 2 days)
3. ✅ **Defer Projects** to post-MVP (P1)
4. ✅ **Defer Environments** to growth phase (P2)

**Why:**
- Your MVP should validate the core product
- Users don't need Projects/Env day 1
- Can add hierarchy later without breaking changes (with strategy above)
- Focus on features that differentiate you

**When to add full model:**
- After product-market fit
- When users request multi-project support
- When you have resources for 3-4 week migration

---

## 📖 Next Steps

### If You Want MVP (Recommended):
1. Review this audit with team
2. Implement P0 org scoping (2 days)
3. Ship MVP with current routes
4. Gather user feedback
5. Plan P1 Projects layer based on demand

### If You Want Full Model:
1. Allocate 3-4 weeks for migration
2. Create detailed migration plan
3. Set up staging environment
4. Implement database changes first
5. Gradual frontend migration

**My Strong Recommendation: Start with MVP approach** ✅
