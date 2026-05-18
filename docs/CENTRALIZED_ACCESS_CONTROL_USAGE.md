# Centralized Access Control - Complete Usage Guide

## 🎯 Overview

This guide shows how to use the **centralized access control system** with Notion-style upgrade prompts that automatically redirect to your Stripe billing page.

---

## 📦 What You Have

### **Components**
```typescript
import {
  // Main wrapper
  FeatureGate,
  
  // Upgrade UI
  UpgradeBadge,
  UpgradeLink,
  UpgradeButton,
  UpgradeCard,
  InlineUpgradePrompt,
  
  // Hooks
  useWorkspacePlan,
  useWorkspaceRole,
  usePermission,
  useFeature,
  useCanPerformAction
} from '@/components/access-control'
```

### **Automatic Features**
- ✅ Role checking (owner, member, guest)
- ✅ Plan checking (free, pro, enterprise)
- ✅ Notion-style upgrade badges
- ✅ Auto-redirect to billing with `?upgrade=pro` param
- ✅ Tooltips with plan info
- ✅ Fully centralized - one import!

---

## 🚀 Quick Start Examples

### **Example 1: Hide Feature for Guests**

```typescript
// src/components/navigation/workspace-dropdown.tsx
import { FeatureGate } from '@/components/access-control'

<FeatureGate permission="inviteMembers" fallback="hide">
  <DropdownMenuItem onClick={() => setShowInvite(true)}>
    <UserPlus className="h-4 w-4" />
    Invite members
  </DropdownMenuItem>
</FeatureGate>
```

**What happens:**
- ✅ Shows for owners & members
- ❌ Hidden for guests
- No upgrade prompt (role restriction, not plan)

---

### **Example 2: Gate Pro Feature with Badge**

```typescript
// src/app/(studio)/[workspace-slug]/analytics/page.tsx
import { FeatureGate, UpgradeCard } from '@/components/access-control'

export default function AnalyticsPage() {
  return (
    <FeatureGate feature="advancedAnalytics" fallback="badge">
      <div className="space-y-6">
        <h1>Advanced Analytics</h1>
        <AnalyticsDashboard />
      </div>
    </FeatureGate>
  )
}
```

**What happens:**
- ✅ Free plan: Shows dimmed content + floating "Plus" badge
- ✅ Click badge → redirects to `/[workspace]/settings/billing?upgrade=pro`
- ✅ Pro plan: Shows full content, no badge

---

### **Example 3: Block Entire Page**

```typescript
// src/app/(studio)/[workspace-slug]/api-keys/page.tsx
import { useFeature, UpgradeCard } from '@/components/access-control'

export default function APIKeysPage() {
  const hasAPIAccess = useFeature('apiAccess')
  
  if (!hasAPIAccess) {
    return (
      <div className="container max-w-2xl py-12">
        <UpgradeCard 
          feature="API Access"
          requiredPlan="pro"
          benefits={[
            "REST API access",
            "50,000 requests/month",
            "Webhooks support",
            "API documentation"
          ]}
        />
      </div>
    )
  }
  
  return <APIKeysManager />
}
```

**What happens:**
- ✅ Shows beautiful upgrade card with benefits
- ✅ "Upgrade to pro" button redirects to billing
- ✅ Shows current plan
- ✅ 14-day guarantee message

---

### **Example 4: Check Team Limits**

```typescript
// src/components/workspace/invite-members-modal.tsx
import { useLimit, InlineUpgradePrompt } from '@/components/access-control'

export function InviteMembersModal() {
  const memberCount = 5 // Get from your data
  const { allowed, limit } = useLimit('maxMembers', memberCount)
  
  if (!allowed) {
    return (
      <DialogWithSidebar>
        <InlineUpgradePrompt 
          feature={`Team size limit (${limit} members)`}
          requiredPlan="pro"
        />
      </DialogWithSidebar>
    )
  }
  
  return <InviteForm />
}
```

**What happens:**
- ✅ Free (3/3 members): Shows upgrade prompt
- ✅ Pro (5/25 members): Shows invite form
- ✅ Click upgrade → billing page

---

### **Example 5: Settings Page (Owner Only)**

```typescript
// src/app/(studio)/[workspace-slug]/settings/page.tsx
import { useWorkspaceRole } from '@/components/access-control'

export default function SettingsPage() {
  const { isOwner } = useWorkspaceRole()
  
  if (!isOwner) {
    return (
      <div className="p-6 text-center">
        <h2>Access Denied</h2>
        <p>Only workspace owners can access settings.</p>
      </div>
    )
  }
  
  return <SettingsPanel />
}
```

**What happens:**
- ✅ Owner: Full access
- ❌ Member/Guest: Access denied message
- No upgrade prompt (role restriction)

---

### **Example 6: Mixed Check (Role + Plan)**

```typescript
// src/components/team/guest-invite-button.tsx
import { FeatureGate } from '@/components/access-control'

<FeatureGate 
  permission="inviteMembers"     // Role check
  feature="guestAccess"          // Plan check
  fallback="badge"
>
  <Button>Invite Guest</Button>
</FeatureGate>
```

**What happens:**
- ✅ Owner on Pro: Shows button
- ❌ Guest: Hidden (no permission)
- ✅ Member on Free: Shows dimmed + upgrade badge

---

## 🎨 All Component Variants

### **1. FeatureGate** (Main Wrapper)

```typescript
<FeatureGate
  permission="inviteMembers"      // Optional: role check
  feature="advancedAnalytics"     // Optional: plan check
  fallback="hide|disable|badge"   // What to do if locked
  message="Custom tooltip"        // Optional custom message
>
  <YourComponent />
</FeatureGate>
```

**Fallback Options:**
- `hide` - Completely hide (default)
- `disable` - Show dimmed with tooltip
- `badge` - Show dimmed with Notion-style badge

---

### **2. UpgradeBadge** (Floating Badge)

```typescript
<UpgradeBadge 
  requiredPlan="pro"
  currentPlan="free"
/>
```

**Features:**
- Floats top-right on element
- Animated pulse gradient
- Click → billing page
- Auto-shows correct icon (✨ Pro, 👑 Enterprise)

---

### **3. UpgradeButton** (CTA Button)

```typescript
<UpgradeButton 
  requiredPlan="pro"
  size="sm|default|lg"
>
  Custom Text
</UpgradeButton>
```

**Sizes:**
- `sm` - Compact
- `default` - Standard
- `lg` - Prominent

---

### **4. UpgradeCard** (Full Card)

```typescript
<UpgradeCard
  feature="Advanced Analytics"
  requiredPlan="pro"
  benefits={[
    "Custom dashboards",
    "Export data",
    "API access"
  ]}
/>
```

**Auto-includes:**
- Crown icon
- Current plan display
- Benefits with checkmarks
- Upgrade button
- 14-day guarantee

---

### **5. InlineUpgradePrompt** (Subtle)

```typescript
<InlineUpgradePrompt
  feature="API Access"
  requiredPlan="pro"
/>
```

**Use for:**
- In-page notifications
- List items
- Menu sections

---

### **6. UpgradeLink** (Text Link)

```typescript
<UpgradeLink requiredPlan="pro">
  Upgrade to unlock
</UpgradeLink>
```

**Use for:**
- Inline text
- Footer notes
- Menu items

---

## 🎯 Real-World Implementation Examples

### **Workspace Dropdown**

```typescript
// src/components/navigation/workspace-dropdown.tsx
import { FeatureGate } from '@/components/access-control'

<DropdownMenuContent>
  {/* Always visible */}
  <DropdownMenuItem>
    Dashboard
  </DropdownMenuItem>
  
  {/* Hidden for guests */}
  <FeatureGate permission="inviteMembers" fallback="hide">
    <DropdownMenuItem onClick={() => setShowInvite(true)}>
      Invite members
    </DropdownMenuItem>
  </FeatureGate>
  
  {/* Owner only */}
  <FeatureGate permission="manageSettings" fallback="hide">
    <DropdownMenuItem>
      Settings
    </DropdownMenuItem>
  </FeatureGate>
</DropdownMenuContent>
```

---

### **Sidebar Navigation**

```typescript
// src/components/navigation/workspace-sidebar.tsx
import { FeatureGate } from '@/components/access-control'

<nav>
  <NavItem href="/dashboard">Dashboard</NavItem>
  <NavItem href="/projects">Projects</NavItem>
  
  {/* Pro feature with badge */}
  <FeatureGate feature="advancedAnalytics" fallback="badge">
    <NavItem href="/analytics">Analytics</NavItem>
  </FeatureGate>
  
  {/* Enterprise feature */}
  <FeatureGate feature="ssoEnabled" fallback="badge">
    <NavItem href="/sso">SSO</NavItem>
  </FeatureGate>
</nav>
```

---

### **Team Page with Limits**

```typescript
// src/app/(studio)/[workspace-slug]/team/page.tsx
import { useLimit, usePermission, InlineUpgradePrompt } from '@/components/access-control'

export default function TeamPage({ members }) {
  const canInvite = usePermission('inviteMembers')
  const { allowed, limit, usage } = useLimit('maxMembers', members.length)
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1>Team ({usage}/{limit})</h1>
        
        {canInvite && (
          allowed ? (
            <Button onClick={() => setShowInvite(true)}>
              Invite Member
            </Button>
          ) : (
            <InlineUpgradePrompt 
              feature={`Team limit reached (${limit} members)`}
              requiredPlan="pro"
            />
          )
        )}
      </div>
      
      <MembersList members={members} />
    </div>
  )
}
```

---

## 🔧 Server-Side Protection

Always validate on the backend too:

```typescript
// src/app/api/projects/route.ts
import { hasPermission, hasFeature, checkLimit } from '@/lib/access-control'

export async function POST(req: Request) {
  const { userId, workspaceId } = await getAuth()
  
  // 1. Check role
  const canCreate = await hasPermission(userId, workspaceId, 'createProjects')
  if (!canCreate) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  // 2. Check limit
  const projectCount = await getProjectCount(workspaceId)
  const { allowed } = await checkLimit(workspaceId, 'maxProjects', projectCount)
  if (!allowed) {
    return Response.json({ error: 'Plan limit reached' }, { status: 402 })
  }
  
  // 3. Create project
  const project = await createProject(...)
  return Response.json(project)
}
```

---

## ✅ Complete Feature Matrix

| Feature | Component | Use Case |
|---------|-----------|----------|
| Hide for role | `<FeatureGate permission="..." fallback="hide">` | Guest can't see settings |
| Dim for plan | `<FeatureGate feature="..." fallback="badge">` | Free sees dimmed Pro features |
| Block page | `<UpgradeCard feature="...">` | API page requires Pro |
| Inline prompt | `<InlineUpgradePrompt feature="...">` | Team limit reached |
| Button CTA | `<UpgradeButton requiredPlan="pro">` | Standalone upgrade |
| Check in code | `usePermission('action')` | Conditional rendering |
| Check limit | `useLimit('maxMembers', count)` | Resource constraints |

---

## 🎯 Best Practices

### **DO ✅**
- Use `FeatureGate` for most cases (centralized)
- Use `fallback="badge"` for plan features (promotes upgrades)
- Use `fallback="hide"` for role restrictions
- Always validate on server-side too
- Show current usage for limits (3/5 projects)

### **DON'T ❌**
- Don't mix role and plan logic manually
- Don't forget server-side validation
- Don't show upgrade for role restrictions
- Don't use complex custom logic (use the hooks!)

---

## 🚀 Quick Migration Checklist

Replace your current checks with centralized components:

```typescript
// ❌ OLD WAY
{user.role === 'owner' && workspace.plan === 'pro' && (
  <AnalyticsButton />
)}

// ✅ NEW WAY
<FeatureGate permission="viewAnalytics" feature="advancedAnalytics">
  <AnalyticsButton />
</FeatureGate>
```

---

## 🎨 Billing Page Integration

The upgrade badges automatically redirect to:
```
/{workspace-slug}/settings/billing?upgrade=pro
```

Your billing page should:
1. Read the `upgrade` query param
2. Pre-select that plan
3. Show Stripe checkout
4. Handle success/cancel

Example:
```typescript
// src/app/(studio)/[workspace-slug]/settings/billing/page.tsx
export default function BillingPage({ searchParams }) {
  const suggestedPlan = searchParams.upgrade // 'pro' or 'enterprise'
  
  return (
    <div>
      <PricingTable defaultPlan={suggestedPlan} />
      <StripeCheckout plan={suggestedPlan} />
    </div>
  )
}
```

---

## 🎉 Summary

**One import, all features:**
```typescript
import { 
  FeatureGate, 
  usePermission, 
  useFeature 
} from '@/components/access-control'
```

**Automatic handling:**
- ✅ Role checks (owner/member/guest)
- ✅ Plan checks (free/pro/enterprise)
- ✅ Upgrade prompts (Notion-style)
- ✅ Billing redirects (with query params)
- ✅ Tooltips & messaging

**Zero boilerplate, maximum conversion!** 🚀
