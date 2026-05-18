# Complete Supabase Centralization Migration Guide

**Last Updated:** October 20, 2025  
**Status:** Archived historical migration guide
**Estimated Time:** 2-3 days

> 2026-05-17 update: this guide predates the Routine Kernel. Any references to workflow schedule routes are historical only. Product automation now uses `contracts/routine.ts`, `/api/routines/**`, `src/lib/routines/*`, `src/components/routines/*`, and `worker/src/routines/*`.

---

## 📋 Overview

This guide walks you through migrating 53 files from direct Supabase client creation to the centralized `src/lib/db/index.ts` pattern - the industry-standard Data Access Layer approach.

---

## 🎯 Goals

1. **Single Database Connection** - One Supabase client instance across the app
2. **Consistent Auth State** - No more "Multiple GoTrueClient instances" warnings
3. **Easier Testing** - Mock one module instead of 53
4. **Better Maintainability** - Change database implementation in one place
5. **Type Safety** - Centralized types and validation

---

## 📊 Current State

**Files Using Direct createClient:** 53  
**Centralized Functions in src/lib/db:** ~50  
**Migration Status:** Ready to Begin

---

## 🚀 Migration Process

### **Step 1: Enable ESLint Rule (5 minutes)**

Add the Supabase centralization rule to your ESLint config:

```bash
# Option A: Extend the rule file
echo 'extends: ["./.eslintrc.supabase.js"]' >> eslint.config.mjs

# Option B: Copy rules directly to eslint.config.mjs
cat .eslintrc.supabase.js >> eslint.config.mjs
```

**Verify:**
```bash
npm run lint
```

You should now see ESLint errors for files using direct `createClient` imports.

---

### **Step 2: Run Migration Analysis (2 minutes)**

Analyze which files need migration:

```bash
# Make script executable
chmod +x scripts/migrate-supabase-imports.js

# Run analysis
node scripts/migrate-supabase-imports.js
```

**Output:** `docs/SUPABASE_MIGRATION_REPORT.md` with detailed migration plan

---

### **Step 3: Add Missing Functions to src/lib/db/index.ts (1-2 hours)**

Review the migration report and add any missing database functions:

**Example: Adding Workflow Functions**

```typescript
// src/lib/db/index.ts

// ============================================================================
// WORKFLOWS
// ============================================================================

/**
 * Get all workflows for an organization
 */
export async function getWorkflows(orgId: string) {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('organization_id', orgId)
    .order('updated_at', { ascending: false });
  
  if (error) {
    console.error('[db] Failed to fetch workflows:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Get a single workflow by ID
 */
export async function getWorkflow(workflowId: string) {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .single();
  
  if (error) {
    console.error('[db] Failed to fetch workflow:', error);
    return null;
  }
  
  return data;
}

/**
 * Create a new workflow
 */
export async function createWorkflow(workflow: {
  organization_id: string;
  user_id: string;
  name: string;
  description?: string;
  nodes?: any[];
  edges?: any[];
  variables?: Record<string, any>;
}) {
  const { data, error } = await supabase
    .from('workflows')
    .insert(workflow as any)
    .select()
    .single();
  
  if (error) {
    console.error('[db] Failed to create workflow:', error);
    throw error;
  }
  
  return data;
}

/**
 * Update a workflow
 */
export async function updateWorkflow(
  workflowId: string,
  updates: {
    name?: string;
    description?: string;
    nodes?: any[];
    edges?: any[];
    variables?: Record<string, any>;
    lucid_l2_workflow_id?: string;
    lucid_l2_synced_at?: string;
  }
) {
  const { data, error } = await supabase
    .from('workflows')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    } as any)
    .eq('id', workflowId)
    .select()
    .single();
  
  if (error) {
    console.error('[db] Failed to update workflow:', error);
    throw error;
  }
  
  return data;
}

/**
 * Delete a workflow (soft delete)
 */
export async function deleteWorkflow(workflowId: string) {
  const { error } = await supabase
    .from('workflows')
    .update({ deleted_at: new Date().toISOString() } as any)
    .eq('id', workflowId);
  
  if (error) {
    console.error('[db] Failed to delete workflow:', error);
    throw error;
  }
}

/**
 * Get workflow versions
 */
export async function getWorkflowVersions(workflowId: string, limit: number = 10) {
  const { data, error } = await supabase
    .from('workflow_versions')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('[db] Failed to fetch workflow versions:', error);
    return [];
  }
  
  return data || [];
}
```

**Repeat for Other Missing Functions:**
- Webhooks
- Schedules  
- Variables
- Credentials
- Etc.

---

### **Step 4: Migrate Individual Files (1-2 days)**

**Migration Pattern:**

```typescript
// ❌ BEFORE: Direct Supabase import
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { data } = await supabase
    .from('workflows')
    .select('*')
    .eq('organization_id', orgId);
  
  return NextResponse.json({ data });
}

// ✅ AFTER: Centralized function
import { getWorkflows } from '@/lib/db';

export async function GET(request: NextRequest) {
  const workflows = await getWorkflows(orgId);
  return NextResponse.json({ data: workflows });
}
```

**File Priority (Migrate in This Order):**

**High Priority (Core Features):**
1. `src/app/api/workflows/[id]/save/route.ts`
2. `src/app/api/workflows/[id]/route.ts`
3. `src/app/api/workflows/route.ts`
4. `src/app/(workflow)/[workspace-slug]/workflows/page.tsx`
5. `src/app/(workflow)/[workspace-slug]/workflows/[workflowId]/page.tsx`

**Medium Priority (Features):**
6-20. Other API routes (webhooks, variables, schedules, versions)
21-35. Organization & member management
36-45. Marketplace & favorites

**Low Priority (Utilities):**
46-53. Utility libraries (can stay as-is if needed)

---

### **Step 5: Test Each Migration (Ongoing)**

After migrating each file:

1. **Lint Check:**
```bash
npm run lint -- path/to/migrated/file.ts
```

2. **Type Check:**
```bash
npm run type-check
```

3. **Manual Test:**
   - Test the feature in the UI
   - Check browser console for errors
   - Verify database operations work

4. **Commit:**
```bash
git add src/path/to/file.ts
git commit -m "refactor: migrate [feature] to centralized Supabase"
```

---

### **Step 6: Verify No Regressions (30 minutes)**

After all files migrated:

1. **Full Lint:**
```bash
npm run lint
```

2. **Full Type Check:**
```bash
npm run type-check
```

3. **Build:**
```bash
npm run build
```

4. **Manual Testing:**
   - Test critical user flows
   - Verify no console errors
   - Check database operations

---

## 📝 Migration Checklist

### Pre-Migration
- [x] ✅ Review `docs/CODEBASE_ANALYSIS_AND_FIXES.md`
- [x] ✅ Enable ESLint rule (`.eslintrc.supabase.js`)
- [x] ✅ Run migration analysis script
- [x] ✅ Review migration report
- [ ] Add missing functions to `src/lib/db/index.ts`

### Core Files (Priority 1)
- [ ] `src/app/api/workflows/[id]/save/route.ts`
- [ ] `src/app/api/workflows/[id]/route.ts`
- [ ] `src/app/api/workflows/route.ts`
- [ ] `src/app/(workflow)/[workspace-slug]/workflows/page.tsx`
- [ ] `src/app/(workflow)/[workspace-slug]/workflows/[workflowId]/page.tsx`

### Workflow Features (Priority 2)
- [ ] `src/app/api/workflows/[id]/webhooks/route.ts`
- [ ] `src/app/api/workflows/[id]/webhooks/[webhookId]/route.ts`
- [ ] `src/app/api/workflows/[id]/variables/route.ts`
- [ ] `src/app/api/workflows/[id]/variables/[variableId]/route.ts`
- [ ] `src/app/api/workflows/[id]/schedules/route.ts`
- [ ] `src/app/api/workflows/[id]/schedules/[scheduleId]/route.ts`
- [ ] `src/app/api/workflows/[id]/versions/route.ts`
- [ ] `src/app/api/workflows/[id]/versions/[versionId]/restore/route.ts`
- [ ] `src/app/api/workflows/[id]/executions/route.ts`

### Organization Management (Priority 3)
- [ ] `src/lib/workspace/index.ts`
- [ ] `src/app/api/orgs/[id]/invites/route.ts`
- [ ] `src/app/api/orgs/[id]/members/route.ts`
- [ ] `src/app/api/organizations/[orgId]/route.ts`
- [ ] `src/app/api/organizations/[orgId]/members/route.ts`
- [ ] `src/app/api/organizations/[orgId]/members/[memberId]/route.ts`
- [ ] `src/app/api/organizations/[orgId]/leave/route.ts`

### Marketplace & Social (Priority 4)
- [ ] `src/app/api/favorites/route.ts`
- [ ] `src/app/api/favorites/[id]/route.ts`
- [ ] `src/app/api/favorites/reorder/route.ts`
- [ ] `src/app/api/v2/marketplace/assets/[id]/like/route.ts`
- [ ] `src/app/api/v2/marketplace/assets/[id]/bookmark/route.ts`
- [ ] `src/app/api/v2/marketplace/assets/[id]/rate/route.ts`
- [ ] `src/app/api/v2/marketplace/organizations/[id]/follow/route.ts`
- [ ] `src/app/api/v2/marketplace/contributors/[handle]/follow/route.ts`
- [ ] `src/app/api/company/[slug]/info/route.ts`

### Utilities & Services (Priority 5)
- [ ] `src/lib/access-control/server.ts`
- [ ] `src/lib/access-control/index.ts`
- [ ] `src/lib/invites/index.ts`
- [ ] `src/lib/uploads/storage.ts`
- [ ] `src/lib/auth/session.ts`
- [ ] `src/lib/auth/cache.ts`
- [ ] `src/lib/auth/handle.ts`
- [ ] `src/lib/mail/index.ts`
- [ ] `src/lib/notifications.ts`
- [ ] `src/lib/notifications/service.ts`
- [ ] `src/lib/marketplace/merger.ts`
- [ ] `src/lib/expressions/context-builder.ts`

### Webhooks & Integrations
- [ ] `src/app/api/webhooks/[path]/route.ts`
- [ ] `src/app/api/webhooks/resend/route.ts`
- [ ] `src/app/api/push/subscribe/route.ts`

### Billing
- [ ] `src/app/(app)/settings/billing/page.tsx`
- [ ] `src/app/api/create-checkout-session/route.ts`

### Verification
- [ ] Run full lint check
- [ ] Run full type check
- [ ] Run build
- [ ] Manual testing of critical flows
- [ ] No "Multiple GoTrueClient" warning
- [ ] All features working correctly

---

## 🛠️ Common Migration Patterns

### Pattern 1: Simple SELECT Query

```typescript
// Before
const { data } = await supabase
  .from('workflows')
  .select('*')
  .eq('organization_id', orgId);

// After
const workflows = await getWorkflows(orgId);
```

### Pattern 2: INSERT with Return

```typescript
// Before
const { data, error } = await supabase
  .from('workflows')
  .insert(newWorkflow)
  .select()
  .single();

// After  
const workflow = await createWorkflow(newWorkflow);
```

### Pattern 3: UPDATE

```typescript
// Before
const { data } = await supabase
  .from('workflows')
  .update({ name: 'New Name' })
  .eq('id', workflowId)
  .select()
  .single();

// After
const workflow = await updateWorkflow(workflowId, { name: 'New Name' });
```

### Pattern 4: Complex Query (Add to src/lib/db)

```typescript
// If query is complex and used in multiple places, add to src/lib/db/index.ts

// src/lib/db/index.ts
export async function getWorkflowsWithExecutions(orgId: string) {
  const { data, error } = await supabase
    .from('workflows')
    .select(`
      *,
      executions:workflow_executions(count)
    `)
    .eq('organization_id', orgId)
    .order('updated_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

// Then use in API route
const workflows = await getWorkflowsWithExecutions(orgId);
```

---

## ⚠️ Common Pitfalls & Solutions

### Pitfall 1: Trying to Use Client in Client Components

**❌ Wrong:**
```typescript
'use client';
import { getProfile } from '@/lib/db'; // ERROR: server-only

function ProfileComponent() {
  const profile = await getProfile(userId); // Won't work!
}
```

**✅ Correct:**
```typescript
// In server component or API route
const profile = await getProfile(userId);

// Pass to client component as prop
<ProfileComponent profile={profile} />
```

### Pitfall 2: Not Handling Errors

**❌ Wrong:**
```typescript
const workflow = await getWorkflow(id); // What if it's null?
return workflow.name; // Crash!
```

**✅ Correct:**
```typescript
const workflow = await getWorkflow(id);
if (!workflow) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
return NextResponse.json({ data: workflow });
```

### Pitfall 3: Missing Function in src/lib/db

**❌ Wrong:**
```typescript
// Using function that doesn't exist yet
const versions = await getWorkflowVersions(id); // Error: not exported
```

**✅ Correct:**
```typescript
// 1. First add to src/lib/db/index.ts
export async function getWorkflowVersions(workflowId: string) { ... }

// 2. Then use it
const versions = await getWorkflowVersions(id);
```

---

## 📈 Progress Tracking

Run the migration script periodically to track progress:

```bash
node scripts/migrate-supabase-imports.js
```

**Expected Progress:**
- Day 1: 53 → 40 files (core features)
- Day 2: 40 → 20 files (features & org management)
- Day 3: 20 → 0 files (utilities & final verification)

---

## ✅ Success Criteria

Migration is complete when:

1. ✅ `npm run lint` shows NO restricted import errors
2. ✅ `npm run type-check` passes
3. ✅ `npm run build` succeeds
4. ✅ No "Multiple GoTrueClient" warning in console
5. ✅ All features work correctly in manual testing
6. ✅ `node scripts/migrate-supabase-imports.js` reports 0 files

---

## 🚀 Next Steps After Migration

1. **Monitor in Production**
   - Watch for any regressions
   - Check error logs
   - Monitor performance

2. **Documentation**
   - Update onboarding docs
   - Add examples to `src/lib/db/index.ts`
   - Create team guidelines

3. **Continuous Improvement**
   - Add JSDoc comments to all functions
   - Add input validation
   - Add caching where appropriate
   - Consider adding query builder abstraction

---

## 📚 References

- **Main Analysis:** `docs/CODEBASE_ANALYSIS_AND_FIXES.md`
- **Migration Report:** `docs/SUPABASE_MIGRATION_REPORT.md` (generated)
- **ESLint Rule:** `.eslintrc.supabase.js`
- **Migration Script:** `scripts/migrate-supabase-imports.js`
- **Centralized DB:** `src/lib/db/index.ts`

---

**Good luck with the migration! 🎉**

Remember: This is a gradual process. Migrate one file at a time, test thoroughly, and commit often.
