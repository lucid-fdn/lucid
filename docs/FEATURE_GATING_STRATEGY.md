# Feature Gating Strategy - Industry Standard Analysis

## 🎯 Overview

This document outlines where and how to implement feature gating in your SaaS application based on industry best practices from Notion, Linear, Vercel, GitHub, and Figma.

---

## 📊 Industry Standard Gating Patterns

### **Two-Layer Security Model**

```
┌─────────────────────────────────────────┐
│           USER ACTION                    │
├─────────────────────────────────────────┤
│  1. ROLE CHECK (Can they do it?)       │
│     └─ owner, member, guest             │
│                                          │
│  2. PLAN CHECK (Do they have access?)   │
│     └─ free, pro, enterprise            │
└─────────────────────────────────────────┘
```

---

## 🔐 Role-Based Gating (Who Can Do What)

### **Owner Only**
Industry standard: Linear, Vercel, GitHub
```
✅ Delete workspace
✅ Transfer ownership
✅ Manage billing
✅ View/export sensitive data
✅ Workspace settings (danger zone)
```

### **Owner + Member**
Industry standard: Notion, Linear
```
✅ Invite team members
✅ Create/edit content
✅ Manage projects
✅ Access analytics
✅ Export data
```

### **Guest (View-Only)**
Industry standard: All SaaS
```
✅ View shared content
❌ No editing
❌ No inviting
❌ No settings access
```

---

## 💎 Plan-Based Gating (What Features Are Available)

### **Free Plan**
Industry standard: All freemium SaaS
```
✅ Basic features
✅ Limited team size (3-5 members)
✅ Limited resources
❌ No advanced features
❌ No API access
❌ No custom branding
```

### **Pro Plan**
Industry standard: Most SaaS target here
```
✅ Advanced analytics
✅ API access
✅ Custom branding
✅ Larger team (10-50 members)
✅ More resources
✅ Priority support
```

### **Enterprise Plan**
Industry standard: For large teams
```
✅ Unlimited everything
✅ SSO
✅ Advanced security
✅ Dedicated support
✅ SLAs
```

---

## 🎨 Where to Gate in Your Application

### **1. Navigation & UI Elements**

**Hide/Show based on plan + role:**
```typescript
// Example: Settings button
{hasPermission('manageSettings') && (
  <SettingsButton />
)}

// Example: Advanced analytics menu item
{hasFeature('advancedAnalytics') && (
  <MenuItem>Advanced Analytics</MenuItem>
)}
```

**Where to apply:**
- Sidebar navigation items
- Dropdown menu options
- Action buttons
- Feature cards/sections

**Industry examples:**
- Notion: Hides "Admin" features from non-admins
- Linear: Shows "Analytics" only on Pro+
- Vercel: Hides "Deployment" button for viewers

---

### **2. Pages & Routes**

**Server-side checks:**
```typescript
// Before rendering page
const canAccess = await canPerformAction(
  userId, 
  workspaceId,
  'viewAnalytics',
  'advancedAnalytics'
)

if (!canAccess) {
  return <UpgradePrompt />
}
```

**Where to apply:**
- Settings pages (owner only)
- Analytics dashboards (plan-gated)
- API keys page (pro+)
- Team management (owner/member)

**Industry examples:**
- GitHub: Settings pages check admin role
- Vercel: Analytics requires Pro plan
- Linear: Team page checks permissions

---

### **3. Actions & Mutations**

**API route protection:**
```typescript
// POST /api/projects
export async function POST(req: Request) {
  // 1. Check role permission
  const canCreate = await hasPermission(
    userId, 
    workspaceId, 
    'createProjects'
  )
  
  // 2. Check plan limit
  const { allowed, limit } = await checkLimit(
    workspaceId,
    'maxProjects',
    currentCount
  )
  
  if (!canCreate) {
    return Response.json(
      { error: 'Insufficient permissions' }, 
      { status: 403 }
    )
  }
  
  if (!allowed) {
    return Response.json(
      { error: `Plan limit reached (${limit} projects)` },
      { status: 402 }
    )
  }
  
  // Create project
}
```

**Where to apply:**
- Create/edit/delete endpoints
- Invite endpoints
- Settings updates
- Resource creation

**Industry examples:**
- All SaaS validate on backend
- Return 403 (forbidden) for role
- Return 402 (payment required) for plan

---

### **4. Feature Sections**

**Inline upgrade prompts:**
```typescript
function AdvancedAnalytics() {
  const hasAccess = useFeature('advancedAnalytics')
  const { plan } = useWorkspacePlan()
  
  if (!hasAccess) {
    return (
      <UpgradeCard
        feature="Advanced Analytics"
        currentPlan={plan}
        requiredPlan="pro"
        benefits={[
          'Custom dashboards',
          'Export data',
          'API access'
        ]}
      />
    )
  }
  
  return <AnalyticsDashboard />
}
```

**Where to apply:**
- Advanced features sections
- Export buttons
- API access pages
- Customization options

**Industry examples:**
- Notion: Shows "Upgrade" card for wiki features
- Linear: Prompts for "Roadmaps" on free plan
- Figma: Shows "Professional" badge on features

---

### **5. Resource Limits**

**Pre-action checks:**
```typescript
function InviteButton() {
  const memberCount = 5
  const { allowed, limit } = useLimit('maxMembers', memberCount)
  
  if (!allowed) {
    return (
      <Tooltip content={`Limit: ${limit} members`}>
        <Button disabled>
          Invite Member
        </Button>
        <UpgradeBadge />
      </Tooltip>
    )
  }
  
  return <Button onClick={handleInvite}>Invite Member</Button>
}
```

**Where to apply:**
- Team member invites
- Project creation
- File uploads
- API calls

**Industry examples:**
- GitHub: Limits private repos on free
- Vercel: Limits deployments per month
- Notion: Limits blocks on free plan

---

## 🎯 Recommended Implementation Priority

### **Phase 1: Critical Gates (Ship First)**
```
✅ Invite members (role: owner/member)
✅ Delete workspace (role: owner only)
✅ Billing management (role: owner only)
✅ Team member limits (plan: free=3, pro=25)
```

### **Phase 2: Feature Gates**
```
✅ Advanced analytics (plan: pro+)
✅ API access (plan: pro+)
✅ Custom branding (plan: pro+)
✅ Export data (role: member+)
```

### **Phase 3: UX Polish**
```
✅ Upgrade prompts
✅ Limit warnings
✅ Feature badges
✅ Tooltips
```

---

## 🏗️ Implementation Patterns

### **Pattern 1: Hide UI Element**
```typescript
{hasPermission('inviteMembers') && (
  <InviteButton />
)}
```
**Use when:** Feature doesn't exist for user
**Example:** Settings button for guests

### **Pattern 2: Disabled with Tooltip**
```typescript
<Tooltip content="Upgrade to Pro">
  <Button disabled={!hasFeature('apiAccess')}>
    API Keys
  </Button>
</Tooltip>
```
**Use when:** Want to show what's available
**Example:** Pro features on free plan

### **Pattern 3: Upgrade Prompt**
```typescript
{!hasFeature('analytics') ? (
  <UpgradeCard feature="analytics" />
) : (
  <Analytics />
)}
```
**Use when:** Major feature sections
**Example:** Analytics dashboard

### **Pattern 4: Inline Limit**
```typescript
<div>
  Projects: {current}/{limit}
  {current >= limit && <UpgradeLink />}
</div>
```
**Use when:** Resource limits
**Example:** Project count, team size

---

## 📍 Your Codebase - Where to Apply

### **High Priority**
1. **Workspace dropdown** - Gate "Invite members" by role
2. **Settings pages** - Gate by owner role
3. **Team page** - Show limits, gate invites
4. **Project creation** - Check limits

### **Medium Priority**
5. **Analytics pages** - Gate by plan (pro+)
6. **API keys page** - Gate by plan (pro+)
7. **Billing page** - Gate by role (owner)
8. **Export features** - Gate by role (member+)

### **Low Priority (Polish)**
9. **Upgrade prompts** - Throughout UI
10. **Feature badges** - "Pro", "Enterprise"
11. **Limit indicators** - Show usage
12. **Tooltips** - Explain why disabled

---

## ✅ Summary

**Role-based:** Control WHO can do WHAT
- Owner: Everything
- Member: Create/edit/invite
- Guest: View only

**Plan-based:** Control WHAT features exist
- Free: Basic with limits
- Pro: Advanced features
- Enterprise: Unlimited

**Implementation:** Two-layer check
```typescript
const canDo = hasPermission('action') && hasFeature('feature')
```

**Next Step:** I can implement these gates throughout your codebase following this strategy.

Would you like me to proceed with implementation?
