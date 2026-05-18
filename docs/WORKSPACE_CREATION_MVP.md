# 🚀 Workspace Creation MVP - Implementation Plan

## ✅ Current Status

### What Exists:
- ✅ Page: `src/app/(studio)/workspace/new/page.tsx`
- ✅ Form: `src/components/settings/organization-form.tsx`
- ✅ Schema: `organizationSchema` in `src/lib/forms/schemas.ts`
- ✅ Action: `createOrganizationAction` in `src/lib/forms/actions.ts`
- ✅ Database: Triggers auto-create default project + production env

### What Needs Fixing:
- ⚠️ Action uses old `/ports/db` instead of new `/lib/db`
- ⚠️ No "type" field (Personal/Team/Company)
- ⚠️ Too many optional fields (not MVP)
- ⚠️ No workspace context after creation
- ❌ No invite system

---

## 🎯 MVP Requirements

### Phase 1: Simple Workspace Creation (30 min)

**Fields (required):**
- Workspace name
- Type: Personal | Team | Company
- Auto-generated slug (read-only)

**Fields (optional):**
- Logo

**Remove from MVP:**
- Bio, homepage, interests
- Social links (GitHub, Twitter, LinkedIn)
- All "About" section

**Flow:**
1. User fills name + type
2. Slug auto-generates
3. Click "Create Workspace"
4. Database trigger creates:
   - Organization (user as owner)
   - Default Project
   - Production Environment
5. Success toast + redirect to dashboard
6. Workspace context loads automatically

---

### Phase 2: Lightweight Invites (1-2 hours)

**Database:**
```sql
CREATE TABLE org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','developer','analyst','viewer','billing')),
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  inviter_id UUID NOT NULL REFERENCES profiles(id),
  accepted_user_id UUID REFERENCES profiles(id),
  accepted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, email, status) WHERE status = 'pending'
);

CREATE INDEX idx_invites_token ON org_invites(token) WHERE status = 'pending';
CREATE INDEX idx_invites_org ON org_invites(org_id);
```

**API Routes:**
- `POST /api/workspace/[id]/invites` - Create invite
- `POST /api/workspace/[id]/invites/accept` - Accept invite
- `DELETE /api/workspace/[id]/invites/[inviteId]` - Revoke invite
- `GET /api/workspace/[id]/invites` - List invites

**UI:**
- Settings → Members page
- "Invite teammate" button
- Email + Role selector
- Copy invite link
- Status display (pending/accepted/revoked)

**Flow:**
1. Owner enters email + role
2. System creates invite with unique token
3. Owner copies link: `/join?token={uuid}`
4. Recipient opens link
5. If logged out → sign up/login
6. If logged in → accept invite
7. System adds to `organization_members`
8. Marks invite as accepted
9. Redirects to workspace

---

## 📋 Implementation Steps

### Step 1: Update Schema (5 min)
```typescript
// src/lib/forms/schemas.ts
export const workspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  slug: handleSchema,
  type: z.enum(['personal', 'team', 'company']),
  logo_url: z.string().url().optional().or(z.literal('')),
})
```

### Step 2: Update Action (10 min)
```typescript
// src/lib/forms/actions.ts
import { createOrganization, checkOrgSlugExists } from '@/lib/db'

export async function createWorkspaceAction(data: unknown) {
  const userId = await requireUserId()
  const validated = workspaceSchema.parse(data)
  
  // Check slug availability
  const exists = await checkOrgSlugExists(validated.slug)
  if (exists) {
    return { success: false, error: 'Slug already taken', field: 'slug' }
  }
  
  // Create org (triggers create project + env)
  const orgId = await createOrganization({
    slug: validated.slug,
    name: validated.name,
    type: validated.type,
    logo_url: validated.logo_url,
  }, userId)
  
  // Redirect to dashboard (workspace loads automatically)
  redirect('/dashboard')
}
```

### Step 3: Simplify Form (15 min)
```typescript
// src/components/settings/workspace-form.tsx
- Remove bio, homepage, interests
- Remove social links
- Add type selector (Personal/Team/Company)
- Keep: name, slug, logo
```

### Step 4: Add Success Toast (5 min)
```typescript
// After redirect, show toast:
"Workspace created — Default project and production environment are ready"

// With actions:
"Add data source · Create agent · Invite teammates"
```

### Step 5: Invite System - Migration (10 min)
```sql
-- migrations/012_org_invites.sql
CREATE TABLE org_invites...
```

### Step 6: Invite System - DB Functions (15 min)
```typescript
// src/lib/db/index.ts
export async function createInvite(...)
export async function acceptInvite(...)
export async function revokeInvite(...)
export async function getOrgInvites(...)
```

### Step 7: Invite System - API Routes (30 min)
```typescript
// src/app/api/workspace/[id]/invites/route.ts
// src/app/api/workspace/[id]/invites/accept/route.ts
```

### Step 8: Invite System - UI Components (30 min)
```typescript
// src/components/settings/invite-member-form.tsx
// src/components/settings/members-list.tsx
```

### Step 9: Invite System - Settings Page (15 min)
```typescript
// src/app/(studio)/settings/members/page.tsx
```

---

## 🧪 Testing Checklist

### Workspace Creation:
- [ ] Can create workspace with name + type
- [ ] Slug auto-generates correctly
- [ ] Logo upload works
- [ ] Database trigger creates project + env
- [ ] Redirects to dashboard
- [ ] Workspace context loads
- [ ] Org switcher shows new workspace
- [ ] Success toast appears

### Invites:
- [ ] Owner can create invite
- [ ] Copy link works
- [ ] Recipient can accept (logged in)
- [ ] Recipient redirected to sign up (logged out)
- [ ] After accept, user is in org_members
- [ ] After accept, user sees workspace
- [ ] Revoke works
- [ ] Expired tokens rejected
- [ ] Duplicate email prevented

### RLS:
- [ ] Cross-org access blocked
- [ ] Role permissions enforced
- [ ] Only owner/admin can invite
- [ ] Members list shows only own orgs

---

## 📊 Time Estimates

| Task | Time |
|------|------|
| Simplify workspace creation | 30 min |
| Invite migration | 10 min |
| Invite DB functions | 15 min |
| Invite API routes | 30 min |
| Invite UI components | 30 min |
| Invite settings page | 15 min |
| Testing | 30 min |
| **Total** | **2.5 hours** |

---

## 🎯 Success Criteria

**MVP Complete When:**
1. ✅ User can create workspace in <30 seconds
2. ✅ Default project + env auto-created
3. ✅ Workspace loads after creation
4. ✅ Owner can invite teammates
5. ✅ Invitees can join via link
6. ✅ Roles enforced by RLS
7. ✅ Cross-org isolation works

---

## 📝 Copy Strings

### Workspace Creation:
```
Title: "Create workspace"
Name label: "Workspace name"
Name placeholder: "Acme AI"
Type label: "Type"
Type options: "Personal · Team · Company"
Helper: "We'll auto-create a default project and a production environment. You can rename later; the slug stays fixed."
Button: "Create workspace"
Success: "Workspace created — Default project and production environment are ready."
Actions: "Add data source · Create agent · Invite teammates"
```

### Invites:
```
Title: "Invite teammate"
Email label: "Email address"
Email placeholder: "colleague@company.com"
Role label: "Role"
Role options: "Owner · Admin · Developer · Analyst · Viewer · Billing"
Button: "Create invite"
Success: "Invite created. Share this link. It expires in 7 days."
Copy button: "Copy invite link"
Accept title: "Join workspace"
Accept message: "You're joining {Org} as {Role}. Continue?"
Accept button: "Join workspace"
```

---

## 🚀 Ready to Ship!

This MVP gives you:
- ✅ Simple workspace creation (30 seconds)
- ✅ Auto-workspace setup (project + env)
- ✅ Multi-user support (invites)
- ✅ Role-based access (RLS enforced)
- ✅ Foundation for scaling

**Everything else (router modes, budgets, compliance) can be added later behind feature flags!**
