# Scalable Contextual Sidebar Implementation

## 🎯 Goal

Create a contextual sidebar that:
1. **MVP**: Simple workspace navigation
2. **Pro**: Reveals projects with one feature flag
3. **Enterprise**: Full Supabase-style hierarchy
4. **Scales seamlessly** without breaking changes

---

## 📊 Database Structure (Keep As-Is)

```sql
organizations (call it "workspaces" in UI)
  ├── id
  ├── name
  ├── slug
  ├── type: 'personal' | 'team'
  └── plan: 'free' | 'pro' | 'enterprise'

projects (hidden by default, shown for pro+)
  ├── id
  ├── organization_id
  ├── name
  ├── slug
  ├── is_default: boolean
  └── hidden: boolean (MVP = true, Pro+ = false)

environments (hidden for MVP/Pro, shown for enterprise)
  ├── id
  ├── project_id
  ├── name: 'production' | 'staging' | 'development'
  └── is_default: boolean
```

---

## 🎨 Sidebar Evolution: 3 Levels

### Level 1: Free Plan (MVP) - "Workspace"
```
┌─────────────────────────┐
│  [My Workspace ▼]       │  ← Workspace switcher
├─────────────────────────┤
│                         │
│  📊 Overview            │  ← Workspace home
│  🗄️  Data               │  ← Direct to tables/data
│  ⚡ Functions            │  ← Direct to functions
│  👥 Team                 │  ← Team management
│  ⚙️  Settings            │  ← Workspace settings
│                         │
└─────────────────────────┘

URL: /workspace/tables (simple!)
```

**What's Hidden:**
- ❌ Projects layer
- ❌ Environments
- ❌ Complex hierarchy

**User Experience:**
- "Your workspace" = direct access
- No confusion about projects
- Simple and clean

---

### Level 2: Pro Plan - "Workspace + Projects"
```
┌─────────────────────────┐
│  [My Workspace ▼]       │  ← Workspace switcher
├─────────────────────────┤
│                         │
│  📊 Overview            │  ← Workspace overview
│                         │
│  📂 Projects            │  ← NEW! Project section
│    ├─ 📋 Project Alpha  │  ← Clickable projects
│    ├─ 📋 Project Beta   │
│    └─ ➕ New project    │
│                         │
│  👥 Team                 │
│  ⚙️  Settings            │
│                         │
└─────────────────────────┘

Click project → Sidebar changes:

┌─────────────────────────┐
│  [My Workspace ▼]       │
│  › Project Alpha        │  ← Project breadcrumb
├─────────────────────────┤
│                         │
│  🏠 Dashboard           │  ← Project home
│  🗄️  Tables             │  ← Project tables
│  ⚡ Functions            │  ← Project functions
│  📊 Analytics           │  ← Project analytics
│  ⚙️  Settings            │  ← Project settings
│                         │
│  ← Back to Workspace    │  ← Easy navigation back
│                         │
└─────────────────────────┘

URL: /workspace/projects/alpha/tables
```

**What's New:**
- ✅ Projects visible
- ✅ Can create multiple projects
- ✅ Sidebar changes per project
- ❌ Environments still hidden

---

### Level 3: Enterprise Plan - "Full Hierarchy"
```
┌─────────────────────────┐
│  [My Workspace ▼]       │
├─────────────────────────┤
│                         │
│  📊 Overview            │
│                         │
│  📂 Projects            │
│    ├─ 📋 Project Alpha  │
│    │   ├─ 🟢 Production │  ← NEW! Environments
│    │   ├─ 🟡 Staging    │
│    │   └─ 🔵 Development│
│    └─ 📋 Project Beta   │
│        └─ 🟢 Production │
│                         │
│  👥 Team                 │
│  ⚙️  Settings            │
│                         │
└─────────────────────────┘

URL: /workspace/projects/alpha/envs/production/tables
```

**What's New:**
- ✅ Full hierarchy
- ✅ Environment management
- ✅ Complete Supabase-style

---

## 🔧 Implementation: Adaptive Sidebar Component

### Core Structure

```typescript
// src/components/navigation/adaptive-sidebar.tsx

import { useWorkspace } from '@/contexts/workspace-context';
import { useFeatureFlags } from '@/hooks/use-feature-flags';

export function AdaptiveSidebar() {
  const { workspace, currentProject } = useWorkspace();
  const { showProjects, showEnvironments } = useFeatureFlags();
  
  // Determine sidebar mode
  const mode = getSidebarMode(workspace, showProjects, showEnvironments);
  
  return (
    <aside className="sidebar">
      <WorkspaceSwitcher />
      
      {mode === 'simple' && <SimpleNav />}
      {mode === 'projects' && <ProjectsNav />}
      {mode === 'full' && <FullHierarchyNav />}
    </aside>
  );
}

function getSidebarMode(workspace, showProjects, showEnvironments) {
  // Enterprise: Full hierarchy
  if (showEnvironments && workspace.plan === 'enterprise') {
    return 'full';
  }
  
  // Pro: Projects visible
  if (showProjects && workspace.plan === 'pro') {
    return 'projects';
  }
  
  // Free/MVP: Simple
  return 'simple';
}
```

### Navigation Items Structure

```typescript
// src/config/navigation.ts

export const NAVIGATION = {
  // Level 1: Workspace Level (Always Available)
  workspace: [
    {
      id: 'overview',
      label: 'Overview',
      icon: '📊',
      href: '/workspace',
      description: 'Workspace dashboard',
      plans: ['free', 'pro', 'enterprise']
    },
    {
      id: 'data',
      label: 'Data',
      icon: '🗄️',
      href: '/workspace/data',
      description: 'Tables and data management',
      plans: ['free', 'pro', 'enterprise']
    },
    {
      id: 'functions',
      label: 'Functions',
      icon: '⚡',
      href: '/workspace/functions',
      description: 'Serverless functions',
      plans: ['free', 'pro', 'enterprise']
    },
    {
      id: 'team',
      label: 'Team',
      icon: '👥',
      href: '/workspace/team',
      description: 'Team management',
      plans: ['free', 'pro', 'enterprise']
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
      href: '/workspace/settings',
      description: 'Workspace settings',
      plans: ['free', 'pro', 'enterprise']
    }
  ],
  
  // Level 2: Projects Section (Pro+)
  projects: [
    {
      id: 'projects',
      label: 'Projects',
      icon: '📂',
      href: '/workspace/projects',
      description: 'Manage projects',
      plans: ['pro', 'enterprise'],
      expandable: true,
      children: 'dynamic' // Loaded from API
    }
  ],
  
  // Level 3: Project Level (When inside a project)
  project: [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: '🏠',
      href: '/workspace/projects/[id]',
      description: 'Project overview',
      plans: ['pro', 'enterprise']
    },
    {
      id: 'tables',
      label: 'Tables',
      icon: '🗄️',
      href: '/workspace/projects/[id]/tables',
      description: 'Database tables',
      plans: ['pro', 'enterprise']
    },
    {
      id: 'functions',
      label: 'Functions',
      icon: '⚡',
      href: '/workspace/projects/[id]/functions',
      description: 'Project functions',
      plans: ['pro', 'enterprise']
    },
    {
      id: 'api',
      label: 'API',
      icon: '🔌',
      href: '/workspace/projects/[id]/api',
      description: 'API documentation',
      plans: ['pro', 'enterprise']
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: '📊',
      href: '/workspace/projects/[id]/analytics',
      description: 'Usage analytics',
      plans: ['pro', 'enterprise']
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
      href: '/workspace/projects/[id]/settings',
      description: 'Project settings',
      plans: ['pro', 'enterprise']
    }
  ],
  
  // Level 4: Environment Section (Enterprise)
  environments: {
    id: 'environments',
    label: 'Environments',
    icon: '🌐',
    description: 'Manage environments',
    plans: ['enterprise'],
    items: [
      {
        id: 'production',
        label: 'Production',
        icon: '🟢',
        color: 'green'
      },
      {
        id: 'staging',
        label: 'Staging',
        icon: '🟡',
        color: 'yellow'
      },
      {
        id: 'development',
        label: 'Development',
        icon: '🔵',
        color: 'blue'
      }
    ]
  }
};
```

---

## 🎯 Feature Flags System

```typescript
// src/hooks/use-feature-flags.ts

export function useFeatureFlags() {
  const { workspace } = useWorkspace();
  
  return {
    // Projects feature
    showProjects: workspace.plan === 'pro' || workspace.plan === 'enterprise',
    
    // Environments feature
    showEnvironments: workspace.plan === 'enterprise',
    
    // Advanced features
    showAnalytics: workspace.plan !== 'free',
    showAdvancedTeam: workspace.plan === 'enterprise',
    
    // UI features
    showUpgradePrompts: workspace.plan === 'free',
    showBetaFeatures: workspace.beta_access === true
  };
}
```

---

## 📱 Component Examples

### Simple Navigation (Free Plan)

```typescript
// src/components/navigation/simple-nav.tsx

export function SimpleNav() {
  const navigation = NAVIGATION.workspace;
  
  return (
    <nav className="space-y-1">
      {navigation.map(item => (
        <NavItem
          key={item.id}
          icon={item.icon}
          label={item.label}
          href={item.href}
        />
      ))}
    </nav>
  );
}
```

### Projects Navigation (Pro Plan)

```typescript
// src/components/navigation/projects-nav.tsx

export function ProjectsNav() {
  const { workspace, projects, currentProject } = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  
  // If inside a project, show project nav
  if (currentProject) {
    return <ProjectDetailNav project={currentProject} />;
  }
  
  // Otherwise, show workspace nav with projects section
  return (
    <nav className="space-y-1">
      {/* Workspace items */}
      {NAVIGATION.workspace.map(item => (
        <NavItem key={item.id} {...item} />
      ))}
      
      <Separator />
      
      {/* Projects section */}
      <NavItem
        icon="📂"
        label="Projects"
        onClick={() => setExpanded(!expanded)}
        badge={projects.length}
      />
      
      {expanded && (
        <div className="pl-4 space-y-1">
          {projects.map(project => (
            <NavItem
              key={project.id}
              icon="📋"
              label={project.name}
              href={`/workspace/projects/${project.slug}`}
            />
          ))}
          <NavItem
            icon="➕"
            label="New project"
            href="/workspace/projects/new"
            variant="ghost"
          />
        </div>
      )}
    </nav>
  );
}
```

### Project Detail Navigation

```typescript
// src/components/navigation/project-detail-nav.tsx

export function ProjectDetailNav({ project }) {
  return (
    <nav className="space-y-1">
      {/* Breadcrumb */}
      <div className="px-3 py-2 text-sm text-muted-foreground">
        <button onClick={() => router.push('/workspace')}>
          ← Back to workspace
        </button>
        <div className="mt-1 font-medium text-foreground">
          {project.name}
        </div>
      </div>
      
      <Separator />
      
      {/* Project navigation */}
      {NAVIGATION.project.map(item => (
        <NavItem
          key={item.id}
          {...item}
          href={item.href.replace('[id]', project.slug)}
        />
      ))}
    </nav>
  );
}
```

---

## 🔄 URL Structure That Scales

```typescript
// Free Plan (Simple)
/workspace              → Overview
/workspace/data         → Tables (direct)
/workspace/functions    → Functions (direct)
/workspace/team         → Team
/workspace/settings     → Settings

// Pro Plan (With Projects)
/workspace                              → Workspace overview
/workspace/projects                     → Projects grid
/workspace/projects/alpha               → Project dashboard
/workspace/projects/alpha/tables        → Project tables
/workspace/projects/alpha/functions     → Project functions
/workspace/projects/alpha/settings      → Project settings

// Enterprise (With Environments)
/workspace/projects/alpha/envs/production/tables
/workspace/projects/alpha/envs/staging/functions
```

---

## 🎨 What Goes in Each Sidebar Level?

### Level 1: Workspace Sidebar (Free)
```typescript
const workspaceSidebarItems = [
  '📊 Overview',          // Workspace dashboard
  '🗄️  Data',             // Direct to tables (uses default project)
  '⚡ Functions',          // Direct to functions (uses default project)
  '📈 Analytics',         // Workspace analytics
  '👥 Team',              // Team management
  '⚙️  Settings',          // Workspace settings
  
  // Bottom section
  '📚 Documentation',     // Help docs
  '💬 Support',          // Support chat
  '⬆️  Upgrade to Pro'    // If free plan
];
```

### Level 2: Workspace + Projects (Pro)
```typescript
const proSidebarItems = [
  '📊 Overview',          // Workspace overview
  
  '📂 Projects',          // Projects section (expandable)
  '  📋 Project Alpha',   // Individual projects
  '  📋 Project Beta',
  '  ➕ New project',
  
  '👥 Team',              // Team management
  '📈 Analytics',         // Workspace-level analytics
  '⚙️  Settings',          // Workspace settings
];
```

### Level 3: Project Detail Sidebar (Pro)
```typescript
const projectSidebarItems = [
  '← Back to Workspace',  // Navigation back
  
  '🏠 Dashboard',         // Project overview
  '🗄️  Tables',           // Project tables
  '⚡ Functions',          // Project functions
  '🔌 API',               // API docs & keys
  '📊 Analytics',         // Project analytics
  '🔒 Security',          // Security settings
  '⚙️  Settings',          // Project settings
];
```

### Level 4: Full Hierarchy (Enterprise)
```typescript
const enterpriseSidebarItems = [
  '📊 Overview',
  
  '📂 Projects',
  '  📋 Project Alpha',
  '    🟢 Production',    // Environments per project
  '    🟡 Staging',
  '    🔵 Development',
  '  📋 Project Beta',
  '    🟢 Production',
  
  '👥 Team',
  '🔐 Access Control',   // Advanced security
  '📈 Analytics',
  '💰 Billing',           // Advanced billing
  '⚙️  Settings',
];
```

---

## 💡 Additional Scalable Features

### 1. Contextual Actions
```typescript
// Bottom of sidebar - changes based on context
<SidebarFooter>
  {inProject && <CreateTableButton />}
  {inWorkspace && <CreateProjectButton />}
  {!isPro && <UpgradeButton />}
</SidebarFooter>
```

### 2. Quick Actions Menu
```typescript
// Keyboard shortcut: Cmd+K
<CommandPalette>
  {inProject && '+ New Table'}
  {inWorkspace && '+ New Project'}
  '+ Invite Team Member'
  '⚙️  Settings'
</CommandPalette>
```

### 3. Recent Items
```typescript
// Top of sidebar (Pro+)
<RecentSection>
  Recently Viewed:
  • Project Alpha → Tables
  • Project Beta → Functions
</RecentSection>
```

### 4. Favorites/Pinned (Pro+)
```typescript
<FavoritesSection>
  ⭐ Favorites:
  • Users Table
  • Authentication Function
  • Production Environment
</FavoritesSection>
```

---

## ✅ Implementation Checklist

### Phase 1: MVP (Free Plan)
- [ ] Simple workspace sidebar
- [ ] Workspace switcher
- [ ] Basic navigation items
- [ ] Auto-create default project (hidden)
- [ ] Direct access to features

### Phase 2: Pro Features
- [ ] Add feature flag system
- [ ] Show/hide projects based on plan
- [ ] Projects section in sidebar
- [ ] Project detail navigation
- [ ] Breadcrumbs for navigation

### Phase 3: Enterprise
- [ ] Add environment layer
- [ ] Full hierarchy navigation
- [ ] Advanced team features
- [ ] Billing section

---

## 🚀 Ready to Scale!

With this architecture:
✅ Start simple (Free plan)
✅ One feature flag = Pro features
✅ Another flag = Enterprise features
✅ No code rewrites needed
✅ Scales seamlessly

Want me to implement this adaptive sidebar system?
