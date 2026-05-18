# Implementation Plan: Hidden Projects + Environments (MVP-Friendly)

**Date:** 2025-10-08  
**Approach:** ✅ **Add Foundation Now, Expose UI Later**  
**Status:** REVISED RECOMMENDATION

---

## 🎯 Why You're Right

### The Correct-by-Construction Approach

**Your Argument:**
> "Retrofitting project/env later touches every table, API, and proof."

**You're 100% correct.** Adding the schema NOW with auto-created defaults:

✅ **Zero user-facing complexity** (hidden behind defaults)  
✅ **Zero URL changes** (keep flat routing)  
✅ **Properly scoped data** from day 1  
✅ **Future-proof** for marketplace, billing, compliance  
✅ **No painful migration** later

### My Initial Concern vs. Reality

| My Concern | Reality |
|------------|---------|
| "Breaking changes" | ❌ Wrong - URLs stay flat |
| "Complex UI" | ❌ Wrong - UI stays simple |
| "Delays MVP" | ❌ Wrong - 2-3 days, saves weeks later |
| "Over-engineering" | ❌ Wrong - This IS the foundation |

**Revised Verdict: Implement Projects + Environments NOW** ✅

---

## 🏗️ Implementation Strategy (MVP-Friendly)

### Phase 1: Database Schema (Day 1)

**Add tables WITHOUT breaking anything:**

```sql
-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default Project',
  slug TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

-- Environments table  
CREATE TABLE environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name IN ('production', 'development', 'staging')),
  is_default BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, name)
);

-- Add columns to existing tables (NULL initially, will backfill)
ALTER TABLE agents ADD COLUMN project_id UUID REFERENCES projects(id);
ALTER TABLE agents ADD COLUMN env_id UUID REFERENCES environments(id);

-- Same for other resource tables
-- (assets, memory, policies, etc.)
```

**Triggers for auto-creation:**

```sql
-- Auto-create default project when org is created
CREATE FUNCTION create_default_project()
RETURNS TRIGGER AS $$
DECLARE
  new_project_id UUID;
BEGIN
  INSERT INTO projects (org_id, name, slug, is_default)
  VALUES (NEW.id, 'Default Project', 'default', true)
  RETURNING id INTO new_project_id;
  
  -- Auto-create production environment
  INSERT INTO environments (project_id, name, is_default)
  VALUES (new_project_id, 'production', true);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_default_project
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION create_default_project();
```

### Phase 2: Auto-Creation Logic (Day 1)

**On user signup:**

```typescript
// src/lib/auth/signup.ts
async function handleSignup(userId: string) {
  // 1. Create profile
  const profile = await createProfile(userId)
  
  // 2. Create Personal Org (auto-triggers project + env)
  const org = await createOrganization({
    name: `${profile.name}'s Workspace`,
    slug: generateSlug(profile.name),
    type: 'personal',
    created_by: userId
  })
  
  // Triggers handle the rest:
  // - Default Project created
  // - Production Environment created
  // - User added as owner
  
  return { profile, org }
}
```

### Phase 3: Context Management (Day 2)

**Store hierarchy in context:**

```typescript
// src/contexts/workspace-context.tsx
interface WorkspaceContext {
  org: Organization
  project: Project  // Hidden for now
  env: Environment  // Always 'production' for now
  
  // Future: setProject(), setEnv()
}

// Initially: Use defaults
const defaultProject = org.projects.find(p => p.is_default)
const defaultEnv = project.environments.find(e => e.is_default)
```

### Phase 4: Scope All Queries (Day 2-3)

**Every query includes full scope:**

```typescript
// Before
const agents = await db.query('SELECT * FROM agents WHERE org_id = $1', [orgId])

// After (correct scoping)
const agents = await db.query(
  'SELECT * FROM agents WHERE org_id = $1 AND project_id = $2 AND env_id = $3',
  [orgId, projectId, envId]
)

// But exposed as simple:
const agents = await getAgents(workspace) // Uses workspace.org/project/env
```

### Phase 5: Feature Flag Multi-Project UI (Future)

```typescript
// src/lib/features.ts
export const FEATURES = {
  multiProject: false,  // Hide for MVP
  multiEnv: false,      // Hide for MVP
}

// When enabled:
// - Show project switcher
// - Show env switcher
// - Enable /org/:id/project/:id routes
```

---

## 📊 What Changes vs. What Stays

### ✅ What STAYS (No Breaking Changes)

**URLs:**
```
/agents        ✅ (same)
/agents/create ✅ (same)
/chat          ✅ (same)
/settings      ✅ (same)
```

**UI:**
```
Navbar         ✅ (same)
Org Switcher   ✅ (same)  
Page layouts   ✅ (same)
```

**User Experience:**
```
Login          ✅ (same)
Navigation     ✅ (same)
Workflows      ✅ (same)
```

### 🔧 What CHANGES (Under the Hood)

**Database:**
```
+ Projects table
+ Environments table
+ project_id column on resources
+ env_id column on resources
+ Auto-creation triggers
```

**Queries:**
```
WHERE org_id = $1
  ↓
WHERE org_id = $1 AND project_id = $2 AND env_id = $3
```

**Context:**
```
{ org }
  ↓
{ org, project, env }  // Used internally
```

---

## 🎯 Implementation Checklist

### Day 1: Database Foundation

- [ ] Create `migrations/010_projects_environments.sql`
- [ ] Add Projects table
- [ ] Add Environments table
- [ ] Add project_id, env_id to resource tables
- [ ] Create auto-creation triggers
- [ ] Backfill existing data

### Day 2: Application Layer

- [ ] Update workspace context to include project/env
- [ ] Create helper: `getCurrentWorkspace()` → `{ org, project, env }`
- [ ] Update all DB queries to include project_id, env_id
- [ ] Add backfill script for existing records

### Day 3: Testing & Verification

- [ ] Test signup flow (auto-creates org/project/env)
- [ ] Test resource creation (scoped correctly)
- [ ] Test org switching (loads correct project/env)
- [ ] Verify RLS policies work with new columns

---

## 💰 Cost-Benefit Analysis

### Implementing NOW:

**Cost:** 2-3 days
- Database migration
- Query updates
- Context changes

**Benefit:** Saves 2-3 WEEKS later
- No data migration
- No API restructuring
- No proof/receipt updates
- Future-proof architecture

**ROI:** 10x return

### Implementing LATER:

**Cost:** 2-3 WEEKS
- Migrate all existing data
- Update every table
- Rewrite all queries
- Update all proofs/receipts
- Risk of data loss
- Downtime for migration

**Benefit:** Saved 2-3 days initially

**ROI:** Terrible

---

## 🔐 Security & Compliance Benefits

### Proper Isolation (Day 1)

**Projects:**
```
Project A: Healthcare data
Project B: Financial data
Project C: Public data
```

**Environments:**
```
production: Live customer data
development: Test data only
```

**Benefits:**
- ✅ Compliance-ready (HIPAA, SOC2, etc.)
- ✅ Data isolation
- ✅ Audit trails per project/env
- ✅ Budget limits per project

---

## 📈 Future Marketplace Readiness

### Asset Passports

```typescript
interface AssetPassport {
  id: UUID
  project_id: UUID  // ← Owner project
  env_id: UUID      // ← Environment
  asset_type: 'agent' | 'model' | 'dataset'
  proof_url: string
}
```

**Why it matters:**
- Marketplace assets owned by projects
- Revenue attribution clear
- Licensing per-project
- Usage tracking per-env

---

## 🚀 Migration Script

```sql
-- migrations/010_projects_environments.sql

-- 1. Create tables
CREATE TABLE projects (...);
CREATE TABLE environments (...);

-- 2. Auto-create for existing orgs
INSERT INTO projects (org_id, name, slug, is_default)
SELECT id, 'Default Project', 'default', true
FROM organizations;

INSERT INTO environments (project_id, name, is_default)
SELECT id, 'production', true
FROM projects;

-- 3. Backfill resource tables
UPDATE agents
SET project_id = (
  SELECT id FROM projects 
  WHERE projects.org_id = agents.org_id 
  AND projects.is_default = true
),
env_id = (
  SELECT id FROM environments 
  WHERE environments.project_id = (
    SELECT id FROM projects 
    WHERE projects.org_id = agents.org_id 
    AND projects.is_default = true
  )
  AND environments.is_default = true
);

-- 4. Make NOT NULL after backfill
ALTER TABLE agents ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE agents ALTER COLUMN env_id SET NOT NULL;
```

---

## ✅ REVISED RECOMMENDATION

### Implement Full Hierarchy NOW

**Why:**
1. ✅ Avoids painful 3-week migration later
2. ✅ Compliance/isolation ready from day 1
3. ✅ Marketplace-ready architecture
4. ✅ Billing/budgets per-project ready
5. ✅ No UI complexity (hidden defaults)
6. ✅ Clean URLs maintained
7. ✅ Only 2-3 days of work

**How:**
1. Add schema (projects, environments)
2. Auto-create defaults on signup
3. Scope all queries properly
4. Hide multi-project UI behind feature flag
5. Ship MVP with solid foundation

**When to expose
