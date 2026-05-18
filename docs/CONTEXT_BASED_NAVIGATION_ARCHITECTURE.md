# Context-Based Navigation Architecture

## 🎯 The Problem

How to handle navigation that changes based on context (org vs project) while:
1. **MVP Stage** - Projects/environments hidden initially
2. **Consumer Friendly** - Don't confuse individual users
3. **Enterprise Ready** - Scale to complex org hierarchies
4. **Industry Standard** - Follow best practices

---

## 📊 Industry Standards Analysis

### Pattern 1: Supabase/Vercel (Your Screenshots)
```
┌─────────────┬──────────────────────────────────┐
│  Global     │                                  │
│  Sidebar    │  Org Level: Projects Grid        │
│  (Fixed)    │  [Card] [Card] [Card]           │
│             │                                  │
│  • Home     │  When click project →            │
│  • Team     │                                  │
│  • Settings │  Project Level: Project Details  │
│             │  Tables | Functions | Replicas  │
└─────────────┴──────────────────────────────────┘
```

**Characteristics:**
- ✅ Single global sidebar (always visible)
- ✅ Content area changes based on context
- ✅ Breadcrumbs show where you are
- ✅ Clean, professional

### Pattern 2: Notion (Workspace-First)
```
┌─────────────┬──────────────────────────────────┐
│  Workspace  │                                  │
│  Sidebar    │  Content Area                    │
│             │                                  │
│  Workspace  │  Dynamic based on selection      │
│  • Pages    │                                  │
│  • Settings │                                  │
│             │                                  │
│  [Switch]   │                                  │
└─────────────┴──────────────────────────────────┘
```

**Characteristics:**
- ✅ Sidebar changes per workspace
- ✅ Workspace switcher always accessible
- ✅ Contextual sidebar content

### Pattern 3: GitHub (Hierarchical)
```
┌─────────────┬──────────────────────────────────┐
│  Repo       │                                  │
│  Sidebar    │  Content Area                    │
│             │                                  │
│  • Code     │  Changes based on sidebar        │
│  • Issues   │  selection                       │
│  • PR       │                                  │
│  • Actions  │                                  │
│  • Settings │                                  │
└─────────────┴──────────────────────────────────┘
```

---

## 🏆 Recommended Solution: Hybrid Pattern

### For Your Use Case:

```
┌──────────┬─────────────┬──────────────────────────┐
│  Global  │  Context    │                          │
│  Nav     │  Sidebar    │  Main Content            │
│  (Icon)  │  (Dynamic)  │                          │
│          │             │                          │
│  🏠      │  ORG LEVEL: │  Projects Grid           │
│  👥      │  • Overview │  [Card] [Card] [Card]   │
│  📊      │  • Projects │                          │
│  ⚙️      │  • Team     │  OR                      │
│          │  • Settings │                          │
│          │             │  PROJECT LEVEL:          │
│          │  PROJECT:   │  Tables | Functions      │
│          │  • Tables   │  Detailed view           │
│          │  • API      │                          │
│          │  • Settings │                          │
└──────────┴─────────────┴──────────────────────────┘
```

---

## 🎨 Implementation Strategy

### Phase 1: MVP (Now) - Single Context

**For Consumers & Simple Users:**
```
┌──────────┬─────────────┬──────────────────────────┐
│  🏠      │  Personal   │                          │
│  📊      │  • Home     │  Your Content            │
│  ⚙️      │  • Profile  │                          │
│          │  • Settings │  (No org hierarchy)     │
│          │             │                          │
│          │  [Hidden:   │                          │
│          │   Projects  │                          │
│          │   Team]     │                          │
└──────────┴─────────────┴──────────────────────────┘
```

**Decision Logic:**
```typescript
// Decide what to show
if (user.type === 'consumer' || user.orgs.length === 1) {
  // Show simplified sidebar
  return <SimplifiedSidebar />
} else {
  // Show full org hierarchy
  return <OrgHierarchySidebar />
}
```

### Phase 2: Organization Added

**When User Creates/Joins Org:**
```
┌──────────┬─────────────┬──────────────────────────┐
│  🏠      │  [Acme Inc] │  Organization Dashboard  │
│  👥      │  • Overview │  [Projects Grid]        │
│  ⚙️      │  • Team     │                          │
│          │  • Settings │  Still hiding            │
│          │             │  project details         │
│          │  [Hidden:   │                          │
│          │   Projects] │                          │
└──────────┴─────────────┴──────────────────────────┘
```

### Phase 3: Projects Enabled (Feature Flag)

**When user.plan === 'pro' || featureFlags.projects:**
```
┌──────────┬─────────────┬──────────────────────────┐
│  🏠      │  [Acme Inc] │  Projects Grid           │
│  📂      │  • Overview │  Click project →         │
│  👥      │  • Projects │                          │
│  ⚙️      │  • Team     │  PROJECT VIEW:           │
│          │             │  • Tables                │
│          │  Project 1  │  • Functions             │
│          │  • Tables   │  • API                   │
│          │  • API      │                          │
└──────────┴─────────────┴──────────────────────────┘
```

---

## 💡 Smart Context Detection

### Auto-Simplify for Consumers

```typescript
// src/components/navigation/adaptive-sidebar.tsx

function getNavigationMode(user: User, org: Organization) {
  // Consumer mode (simplest)
  if (user.type === 'consumer') {
    return 'simple';
  }
  
  // Single personal org (hide complexity)
  if (user.orgs.length === 1 && org.type === 'personal') {
    return 'simple';
  }
  
  // Has projects (show hierarchy)
  if (org.projects && org.projects.length > 0) {
    return 'full';
  }
  
  // Default: org-level only
  return 'org';
}
```

### Modes:

#### Simple Mode (Consumer)
```typescript
const SimpleNavigation = {
  sections: [
    { icon: '🏠', label: 'Home', href: '/dashboard' },
    { icon: '📊', label: 'Analytics', href: '/analytics' },
    { icon: '⚙️', label: 'Settings', href: '/settings' }
  ]
}
```

#### Org Mode (Team, No Projects)
```typescript
const OrgNavigation = {
  header: <OrgSwitcher />,
  sections: [
    { icon: '📊', label: 'Overview', href: '/workspace/[id]' },
    { icon: '👥', label: 'Team', href: '/workspace/[id]/team' },
    { icon: '⚙️', label: 'Settings', href: '/workspace/[id]/settings' }
  ]
}
```

#### Full Mode (Enterprise)
```typescript
const FullNavigation = {
  header: <OrgSwitcher />,
  sections: [
    { icon: '📊', label: 'Overview', href: '/workspace/[id]' },
    { 
      icon: '📂', 
      label: 'Projects', 
      href: '/workspace/[id]/projects',
      children: [
        { label: 'Project 1', href: '/workspace/[id]/projects/1' }
      ]
    },
    { icon: '👥', label: 'Team', href: '/workspace/[id]/team' },
    { icon: '⚙️', label: 'Settings', href: '/workspace/[id]/settings' }
  ]
}
```

---

## 🎯 Routing Architecture

### URL Structure

```typescript
// Consumer (Personal org hidden)
/dashboard              // Home
/analytics             // Analytics
/settings              // Personal settings

// Organization Level
/workspace/[orgId]          // Org overview (projects grid)
/workspace/[orgId]/team     // Team management
/workspace/[orgId]/settings // Org settings

// Project Level (when enabled)
/workspace/[orgId]/projects/[projectId]           // Project dashboard
/workspace/[orgId]/projects/[projectId]/tables    // Tables
/workspace/[orgId]/projects/[projectId]/api       // API
/workspace/[orgId]/projects/[projectId]/settings  // Project settings
```

### Breadcrumbs

```typescript
// Always show context
<Breadcrumbs>
  <OrgSwitcher current={org} />
  {project && <ProjectSwitcher current={project} />}
  <CurrentPage />
</Breadcrumbs>
```

---

## 🔄 Transition Strategy

### Phase 1: Launch (MVP)
```typescript
const config = {
  showProjects: false,           // Hidden
  showEnvironments: false,       // Hidden
  consumerMode: 'auto-detect',  // Auto-simplify
}
```

**What Users See:**
- Consumers: Simple nav (Home, Analytics, Settings)
- Teams: Org nav (Overview, Team, Settings)
- No project complexity yet

### Phase 2: Projects Beta
```typescript
const config = {
  showProjects: user.plan === 'pro',  // Feature flag
  showEnvironments: false,             // Still hidden
  consumerMode: 'auto-detect',
}
```

**What Users See:**
- Pro users: Projects appear in sidebar
- Others: Same as before
- Gradual rollout

### Phase 3: Full Platform
```typescript
const config = {
  showProjects: true,
  showEnvironments: user.plan === 'enterprise',
  consumerMode: 'auto-detect',  // Still simplify for consumers
}
```

**What Users See:**
- Everyone: Projects
- Enterprise: Full hierarchy with environments
- Consumers: Still simplified (auto-detected)

---

## 📱 Responsive Behavior

### Desktop
```
┌──────────┬─────────────┬──────────────────┐
│  Icon    │  Sidebar    │  Content         │
│  Nav     │  (Always)   │                  │
└──────────┴─────────────┴──────────────────┘
```

### Mobile
```
┌────────────────────────────────────┐
│  ☰  Org Name          🔔  👤      │
├────────────────────────────────────┤
│                                    │
│  Content (Full Width)              │
│                                    │
│                                    │
└────────────────────────────────────┘

Tap ☰ → Drawer slides in
```

---

## 🎨 Visual Hierarchy

### Sidebar Structure

```
┌─────────────────────┐
│  [Org Switcher]     │  ← Always visible
├─────────────────────┤
│                     │
│  Context Nav        │  ← Changes based on level
│  • Item 1           │
│  • Item 2           │
│  • Item 3           │
│                     │
├─────────────────────┤
│  [Upgrade]          │  ← If applicable
│  [Help]             │
└─────────────────────┘
```

### State Indicators

```typescript
<SidebarItem 
  active={pathname === '/workspace/123/team'}  // Highlighted
  badge={unreadCount}                      // Notification badge
  icon={<TeamIcon />}                      // Visual cue
  label="Team"
/>
```

---

## 🏗️ Component Architecture

```typescript
// src/components/navigation/adaptive-nav.tsx

<AdaptiveNavigation>
  {/* Icon nav (always visible) */}
  <IconNav />
  
  {/* Context sidebar (dynamic) */}
  <ContextSidebar mode={navigationMode}>
    {mode === 'simple' && <SimpleNav />}
    {mode === 'org' && <OrgNav />}
    {mode === 'full' && <FullNav />}
  </ContextSidebar>
  
  {/* Main content */}
  <MainContent>
    <Breadcrumbs />
    {children}
  </MainContent>
</AdaptiveNavigation>
```

---

## ✅ Best Practices Summary

### 1. Progressive Disclosure ✓
- Start simple
- Add complexity as needed
- Never overwhelm users

### 2. Context Awareness ✓
- Sidebar reflects current context
- Breadcrumbs show hierarchy
- Easy navigation between levels

### 3. Auto-Detection ✓
- Detect consumer vs business
- Simplify automatically
- No manual configuration needed

### 4. Scalability ✓
- Works for 1 user
- Works for 1000-person enterprise
- Same architecture, different views

### 5. Industry Standard ✓
- Follows Supabase/Vercel pattern
- Familiar to users
- Professional look

---

## 🎯 Recommended Implementation

### For Your Case:

```typescript
/**
 * Navigation modes based on user context
 */
export type NavigationMode = 
  | 'consumer'    // Simplified (no org concept)
  | 'org'         // Org-level (team, settings)
  | 'full'        // Full hierarchy (projects, envs)

/**
 * Auto-detect navigation mode
 */
function detectNavigationMode(user, org, featureFlags) {
  // Consumer: Simplest
  if (user.type === 'consumer' || org.type === 'personal') {
    return 'consumer';
  }
  
  // Projects enabled: Full hierarchy
  if (featureFlags.projects && org.projects.length > 0) {
    return 'full';
  }
  
  // Default: Org-level
  return 'org';
}
```

### Benefits:
- ✅ **MVP Friendly** - Start simple
- ✅ **Consumer Friendly** - Auto-simplifies
- ✅ **Enterprise Ready** - Scales up
- ✅ **Industry Standard** - Proven pattern
- ✅ **Future Proof** - Easy to enhance

---

## 🚀 Next Steps

1. **Create adaptive navigation component**
2. **Implement navigation modes**
3. **Add feature flags for projects**
4. **Test with different user types**
5. **Gather feedback and iterate**

Would you like me to implement this architecture?
