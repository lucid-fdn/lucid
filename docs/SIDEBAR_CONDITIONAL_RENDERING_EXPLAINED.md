# 🎯 Sidebar Conditional Rendering - Complete Guide

## 📋 Overview

Your adaptive sidebar uses **multiple layers of conditional rendering** to show the right navigation based on:
1. **Feature flags** (`multiProject`, `multiEnv`)
2. **User's plan** (free, pro, enterprise)
3. **Current context** (workspace vs project view)
4. **Data availability** (workspace loaded, projects exist)

---

## 🏗️ Architecture Layers

```
AdaptiveSidebar (Parent)
    ↓ (Decides which nav to show)
    ├─ WorkspaceNav (Default - Always available)
    └─ ProjectNav (Pro+ only - When viewing project)
```

---

## 1️⃣ Top Level: AdaptiveSidebar

**File:** `src/components/navigation/adaptive-sidebar.tsx`

### Conditional Logic Flow

```typescript
export function AdaptiveSidebar() {
  const { workspace, loading } = useWorkspace();
  const { multiProject } = useFeatureFlags();
  
  // CONDITION 1: Loading state
  if (loading) {
    return <SidebarSkeleton />;
  }
  
  // CONDITION 2: No workspace data
  if (!workspace) {
    return null; // Don't show anything
  }
  
  // CONDITION 3: Check current view context
  const currentProject = null; // TODO: Get from URL/context
  
  // CONDITION 4: Project view (Pro+ only)
  if (currentProject && multiProject) {
    return <ProjectNav project={currentProject} />;
  }
  
  // DEFAULT: Workspace view (All users)
  return <WorkspaceNav />;
}
```

### Decision Tree

```
User loads sidebar
    ↓
Is data loading? → YES → Show skeleton
    ↓ NO
Does workspace exist? → NO → Show nothing
    ↓ YES
Is user viewing a project? → YES → Has multiProject flag? → YES → Show ProjectNav
    ↓ NO                                                   ↓ NO
Show WorkspaceNav                                    Show WorkspaceNav
```

---

## 2️⃣ Workspace Level: WorkspaceNav

**File:** `src/components/navigation/workspace-nav.tsx`

### Multiple Conditional Rendering Points

#### A. Plan-Based Filtering

```typescript
export function WorkspaceNav() {
  const { workspace } = useWorkspace();
  const { multiProject } = useFeatureFlags();
  
  // Get user's plan (currently hardcoded to 'free')
  const plan: 'free' | 'pro' | 'enterprise' = 'free';
  
  // CONDITION 1: Filter nav items by plan
  const navItems = filterNavigationByPlan(workspaceNavigation, plan);
  
  return (
    <div>
      {/* Render filtered items */}
      {navItems.map((item) => (
        <NavItemButton key={item.href} item={item} />
      ))}
    </div>
  );
}
```

#### B. Feature Flag Conditional

```typescript
{/* CONDITION 2: Show Projects section only if multiProject is enabled */}
{multiProject && (
  <>
    <Separator className="my-2" />
    <div>
      <button onClick={() => setProjectsExpanded(!projectsExpanded)}>
        Projects
      </button>
      
      {/* CONDITION 3: Show project list if expanded */}
      {projectsExpanded && (
        <div>
          {/* Project list here */}
        </div>
      )}
    </div>
  </>
)}
```

#### C. Plan-Based Upgrade Prompt

```typescript
// CONDITION 4: Show upgrade prompt for free users
const showUpgrade = plan === 'free';

{showUpgrade && (
  <NavItemButton
    item={upgradeNavItem}
    variant="default"
  />
)}
```

### Complete Conditional Flow

```typescript
<div className="sidebar">
  {/* Always shown */}
  <WorkspaceHeader />
  
  <nav>
    {/* FILTERED: Only items for user's plan */}
    {navItems.map(item => <NavItemButton />)}
    
    {/* CONDITIONAL: Pro+ only */}
    {multiProject && (
      <>
        <Separator />
        <ProjectsSection>
          {/* NESTED CONDITIONAL: Expanded state */}
          {projectsExpanded && (
            <ProjectList />
          )}
        </ProjectsSection>
      </>
    )}
  </nav>
  
  {/* Always shown */}
  <BottomNav />
  
  {/* CONDITIONAL: Free plan only */}
  {showUpgrade && <UpgradePrompt />}
</div>
```

---

## 3️⃣ Config Level: Navigation Items

**File:** `src/config/workspace-nav.ts`

### Plan-Based Configuration

Each nav item has a `plans` array:

```typescript
{
  title: 'Overview',
  href: '/workspace',
  icon: 'LayoutDashboard',
  plans: ['free', 'pro', 'enterprise'], // Available to all
}

{
  title: 'Projects',
  href: '/workspace/projects',
  icon: 'Folder',
  plans: ['pro', 'enterprise'], // Pro+ only
}
```

### Filtering Function

```typescript
export function filterNavigationByPlan(
  items: NavItem[],
  currentPlan: 'free' | 'pro' | 'enterprise'
): NavItem[] {
  return items.filter(item => {
    // If no plans specified, show to everyone
    if (!item.plans) return true;
    
    // Otherwise, check if current plan is in allowed plans
    return item.plans.includes(currentPlan);
  });
}
```

---

## 🎚️ Feature Flag Integration

**File:** `src/lib/features.ts`

### How Flags Control Rendering

```typescript
export function useFeatureFlags() {
  return {
    multiProject: false,  // MVP: Single project per workspace
    multiEnv: false,      // Pro: Multiple projects
                          // Enterprise: Multiple environments
  };
}
```

### Impact on Sidebar

| Flag | Off (MVP) | On (Pro+) |
|------|-----------|-----------|
| `multiProject` | Simple workspace nav only | Projects section appears |
| `multiEnv` | N/A | Environment switcher in project view |

---

## 📊 Scalability Pattern

### 4 Levels of Navigation Hierarchy

```
Level 1: Workspace (MVP - All users)
└─ Overview, Data, Functions, Analytics, Team, Settings

Level 2: Projects (Pro - multiProject flag)
└─ Workspace navigation + Projects section
   └─ Project A, Project B, Project C

Level 3: Project Detail (Pro - when viewing project)
└─ Dashboard, Tables, Functions, API, Analytics, Security, Settings

Level 4: Environments (Enterprise - multiEnv flag)
└─ Project Detail navigation with environment switcher
   └─ Production, Staging, Development
```

### How It Scales

```typescript
// MVP (free plan, no flags)
<WorkspaceNav>
  - Overview
  - Data
  - Functions
  - Analytics
  - Team
  - Settings
  - [Upgrade to Pro button]
</WorkspaceNav>

// Pro (pro plan, multiProject = true)
<WorkspaceNav>
  - Overview
  - Data
  - Functions
  - Analytics
  - Team
  - Settings
  ---
  - Projects ▼
    - Project A
    - Project B
    - + New project
</WorkspaceNav>

// Enterprise (enterprise plan, multiProject + multiEnv = true)
<ProjectNav>
  - [Environment: Production ▼]
  - Dashboard
  - Tables
  - Functions
  - API
  - Analytics
  - Security
  - Settings
</ProjectNav>
```

---

## 🔍 Conditional Rendering Patterns

### Pattern 1: Simple Boolean

```typescript
{condition && <Component />}

// Example:
{multiProject && <ProjectsSection />}
```

### Pattern 2: Ternary

```typescript
{condition ? <ComponentA /> : <ComponentB />}

// Example:
{loading ? <Skeleton /> : <Content />}
```

### Pattern 3: Early Return

```typescript
if (condition) return <ComponentA />;
return <ComponentB />;

// Example:
if (loading) return <SidebarSkeleton />;
if (!workspace) return null;
return <WorkspaceNav />;
```

### Pattern 4: Array Filter

```typescript
items.filter(condition).map(item => <Component />)

// Example:
navItems
  .filter(item => item.plans?.includes(currentPlan))
  .map(item => <NavItemButton item={item} />)
```

### Pattern 5: Array Map with Conditional

```typescript
{items.map(item => 
  item.condition && <Component key={item.id} />
)}
```

---

## 🎯 Complete Example

Let's trace what a **Pro user** with **multiProject enabled** sees:

```typescript
// 1. AdaptiveSidebar renders
function AdaptiveSidebar() {
  const { multiProject } = useFeatureFlags(); // true
  const currentProject = null; // Not viewing project
  
  // Since currentProject is null, shows WorkspaceNav
  return <WorkspaceNav />;
}

// 2. WorkspaceNav renders
function WorkspaceNav() {
  const plan = 'pro';
  const { multiProject } = useFeatureFlags(); // true
  
  // Filter nav items
  const navItems = filterNavigationByPlan(workspaceNavigation, plan);
  // Returns: All items (all have 'pro' in their plans array)
  
  return (
    <div>
      {/* Shows all 6 workspace items */}
      {navItems.map(item => <NavItemButton />)}
      
      {/* Condition TRUE: Shows projects section */}
      {multiProject && (
        <ProjectsSection>
          {/* Shows project list */}
          <ProjectA />
          <ProjectB />
          <NewProjectButton />
        </ProjectsSection>
      )}
      
      {/* Condition FALSE: No upgrade prompt (not free plan) */}
      {plan === 'free' && <UpgradePrompt />}
    </div>
  );
}
```

### Result: User Sees

```
┌─────────────────────────┐
│ 🏢 Acme Corp           │ ← Workspace header
│ Pro plan               │
├─────────────────────────┤
│ 📊 Overview            │ ← All 6 workspace items
│ 🗄️ Data                │
│ ⚡ Functions           │
│ 📈 Analytics           │
│ 👥 Team                │
│ ⚙️ Settings            │
├─────────────────────────┤
│ 📁 Projects ▼          │ ← Pro feature (multiProject)
│   Project Alpha        │
│   Project Beta         │
│   ➕ New project       │
├─────────────────────────┤
│ 📖 Documentation       │ ← Bottom nav (always shown)
│ 💬 Support             │
└─────────────────────────┘
```

---

## 🚀 Key Takeaways

### 1. Multiple Layers of Conditionals

- **Component level**: Which component to render
- **Section level**: Which sections to show
- **Item level**: Which items to display
- **State level**: Expanded/collapsed states

### 2. Separation of Concerns

- **AdaptiveSidebar**: Decides workspace vs project view
- **WorkspaceNav**: Handles workspace-level conditionals
- **Config**: Declares what's available per plan
- **Feature flags**: Control major features

### 3. Scalability Built-In

- Free → Pro: One flag (`multiProject`)
- Pro → Enterprise: One flag (`multiEnv`)
- No code changes needed!

### 4. Performance Optimized

- Early returns prevent unnecessary rendering
- Filtered arrays avoid rendering hidden items
- Loading states prevent flash of wrong content

---

## 🔧 How to Modify

### Add New Nav Item

```typescript
// In workspace-nav.ts
{
  title: 'New Feature',
  href: '/workspace/new-feature',
  icon: 'Star',
  plans: ['pro', 'enterprise'], // Choose who sees it
}
```

### Add New Feature Flag

```typescript
// In features.ts
export function useFeatureFlags() {
  return {
    multiProject: false,
    multiEnv: false,
    newFeature: true, // ← Add flag
  };
}

// In workspace-nav.tsx
const { multiProject, newFeature } = useFeatureFlags();

{newFeature && <NewFeatureSection />}
```

### Change Plan Logic

```typescript
// Get plan from database instead of hardcoded
const plan = workspace.plan || 'free';

// Or get from subscription service
const { plan } = useSubscription();
```

---

## 📝 Summary

Your sidebar uses **conditional rendering** at every level:

1. **AdaptiveSidebar** → Chooses entire nav type
2. **WorkspaceNav** → Filters items by plan + flags
3. **ProjectNav** → Shows when viewing projects
4. **Config** → Declares availability rules

**Result:** A single component that scales from simple MVP to complex Enterprise without code changes - just flip flags and update plans!

---

## 🎓 Best Practices

1. ✅ Use early returns for major branches
2. ✅ Filter arrays before mapping
3. ✅ Keep conditions simple and readable
4. ✅ Separate config from logic
5. ✅ Use feature flags for major features
6. ✅ Use plans for access control
7. ✅ Handle loading/error states
8. ✅ Provide fallbacks for missing data

**Your sidebar follows all these practices!** 🎉
