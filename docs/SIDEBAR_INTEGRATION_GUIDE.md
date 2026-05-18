# 🚀 Sidebar Integration Guide

## Quick Start (5 minutes)

### Step 1: Add to Studio Layout

Update your `src/app/(studio)/layout.tsx`:

```typescript
import { SidebarProvider, SidebarInset } from "@/ui/components/sidebar"
import { WorkspaceSidebar } from "@/components/navigation/workspace-sidebar"

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider defaultOpen={true}>
      <WorkspaceSidebar />
      <SidebarInset>
        <main className="flex flex-1 flex-col gap-4 p-4">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

### Step 2: That's it! 🎉

The sidebar will now appear on all studio pages.

---

## ✅ What You Get

### Workspace Dropdown
```
┌─────────────────────────────────┐
│ ⚡ Your Workspace ▼             │
│ Free Plan · 1 member            │
└─────────────────────────────────┘

Click to open:
- User info
- Workspace switcher
- Settings (modal)
- Invite members
- Logout
```

### Navigation
```
🔍 Search             ⌘K
🏠 Home
📥 Inbox

🌟 Marketplace

📁 Teamspaces
  ⚡ Your Project
     🗄️ Data
     ⚡ Functions
     📊 Analytics

🗑️ Trash
```

### Features
- ✅ Collapsible (click toggle or ⌘B)
- ✅ Search shortcut (⌘K)
- ✅ Settings modal (fast!)
- ✅ Mobile responsive (sheet)
- ✅ Feature flag controlled
- ✅ Loading states
- ✅ Type-safe

---

## 🎨 Customization

### Toggle Features

In `src/lib/features.ts`:

```typescript
// Disable search in sidebar
sidebarSearch: false,

// Hide favorites/shared/private sections
sidebarFavorites: false,
sidebarShared: false,
sidebarPrivate: false,

// Use page navigation for settings
settingsModal: false,

// Put team in sidebar nav (not dropdown)
teamInDropdown: false,
```

### Add Custom Nav Items

```typescript
import { NavItem } from "@/components/navigation/nav-item"
import { FileText } from "lucide-react"

<NavItem href="/docs" icon={FileText} label="Documentation" />
```

### Add Custom Sections

```typescript
import { NavSection } from "@/components/navigation/nav-section"

<NavSection title="My Section">
  <NavItem href="/item1" label="Item 1" />
  <NavItem href="/item2" label="Item 2" />
</NavSection>
```

### Customize Workspace Dropdown

```typescript
import { WorkspaceDropdown } from "@/components/navigation/workspace-dropdown"

<WorkspaceDropdown 
  onSettingsClick={() => {
    // Custom handler
    console.log('Settings clicked')
    setShowSettings(true)
  }}
/>
```

---

## 🔧 Advanced Configuration

### Default Open State

```typescript
<SidebarProvider defaultOpen={false}>
  {/* Starts collapsed */}
</SidebarProvider>
```

### Controlled State

```typescript
const [open, setOpen] = useState(true)

<SidebarProvider open={open} onOpenChange={setOpen}>
  <WorkspaceSidebar />
</SidebarProvider>
```

### Custom Keyboard Shortcuts

The sidebar comes with:
- `⌘B` / `Ctrl+B` - Toggle sidebar
- `⌘K` / `Ctrl+K` - Open search

To add more:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'h' && (e.metaKey || e.ctrlKey)) {
      router.push('/home')
    }
  }
  
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

---

## 📱 Mobile Behavior

On mobile (< 768px):
- Sidebar becomes a Sheet (overlay)
- Opens on hamburger menu click
- Closes after navigation
- Full-screen takeover

No configuration needed - works automatically!

---

## 🎯 Integration Checklist

### Required
- [x] Add `SidebarProvider` to layout
- [x] Add `WorkspaceSidebar` component
- [x] Wrap content in `SidebarInset`

### Optional
- [ ] Customize feature flags
- [ ] Add custom nav items
- [ ] Add custom sections
- [ ] Implement search command palette
- [ ] Fetch real inbox count
- [ ] Add favorites functionality
- [ ] Add shared items functionality
- [ ] Add private items functionality

---

## 🐛 Troubleshooting

### Sidebar not showing

**Check:**
1. Is `SidebarProvider` wrapping everything?
2. Is workspace context available?
3. Check browser console for errors

```typescript
// Debug workspace
const { workspace, loading } = useWorkspace()
console.log('Workspace:', workspace, 'Loading:', loading)
```

### Settings modal not opening

**Check:**
1. Is `settingsModal` feature flag enabled?
2. Is `onSettingsClick` callback firing?

```typescript
// Debug
<WorkspaceDropdown 
  onSettingsClick={() => {
    console.log('Settings clicked!')
    setShowSettings(true)
  }}
/>
```

### Keyboard shortcuts not working

**Check:**
1. Is there another component capturing the event?
2. Try in a clean browser profile

```typescript
// Debug
useEffect(() => {
  window.addEventListener('keydown', (e) => {
    console.log('Key:', e.key, 'Meta:', e.metaKey, 'Ctrl:', e.ctrlKey)
  })
}, [])
```

---

## 🚀 Next Steps

### 1. Implement Search
```typescript
// Create command palette
import { CommandDialog } from "@/ui/components/command"

<SearchButton onClick={() => setShowCommand(true)} />
<CommandDialog open={showCommand} onOpenChange={setShowCommand}>
  {/* Your command palette */}
</CommandDialog>
```

### 2. Fetch Inbox Count
```typescript
// In workspace-sidebar.tsx
const { data: inbox } = useQuery({
  queryKey: ['inbox', workspace.org.id],
  queryFn: () => fetchInboxCount(workspace.org.id),
})

<NavItem href="/inbox" icon={Inbox} label="Inbox" badge={inbox?.unread} />
```

### 3. Add Favorites
```typescript
// Create favorites hook
const { favorites } = useFavorites()

<NavSection title="Favorites">
  {favorites?.map(item => (
    <NavItem key={item.id} href={item.href} label={item.name} />
  ))}
</NavSection>
```

### 4. Multi-Workspace Support
```typescript
// When ready, just add API:
const { data: workspaces } = useQuery({
  queryKey: ['workspaces'],
  queryFn: fetchUserWorkspaces,
})

// Dropdown already handles it!
```

---

## 📊 Performance Tips

### 1. Lazy Load Modal
```typescript
// Already implemented!
const SettingsModal = dynamic(() => 
  import('@/components/settings/settings-modal'),
  { loading: () => <Skeleton /> }
)
```

### 2. Cache Sidebar Data
```typescript
// Use React Query
const { data: navData } = useQuery({
  queryKey: ['sidebar', workspace.org.id],
  queryFn: fetchSidebarData,
  staleTime: 5 * 60 * 1000, // 5 min
})
```

### 3. Memoize Heavy Components
```typescript
const MemoizedNavSection = React.memo(NavSection)
```

---

## ✅ Complete Example

```typescript
// src/app/(studio)/layout.tsx
"use client"

import { SidebarProvider, SidebarInset } from "@/ui/components/sidebar"
import { WorkspaceSidebar } from "@/components/navigation/workspace-sidebar"

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full">
        <WorkspaceSidebar />
        
        <SidebarInset className="flex-1">
          <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
            <h1 className="text-xl font-bold">Your App</h1>
          </header>
          
          <main className="flex-1 p-4 md:p-6">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
```

---

## 🎓 Best Practices

### 1. Always Use SidebarProvider
```typescript
// ✅ Good
<SidebarProvider>
  <WorkspaceSidebar />
  <SidebarInset>{children}</SidebarInset>
</SidebarProvider>

// ❌ Bad
<WorkspaceSidebar /> // Won't work without provider
```

### 2. Don't Nest Providers
```typescript
// ❌ Bad
<SidebarProvider>
  <SidebarProvider> // Double wrap
    <WorkspaceSidebar />
  </SidebarProvider>
</SidebarProvider>
```

### 3. Use Feature Flags
```typescript
// ✅ Good - Easy to toggle
const { sidebarSearch } = useFeatureFlags()
{sidebarSearch && <SearchButton />}

// ❌ Bad - Hardcoded
<SearchButton /> // Can't disable without code change
```

### 4. Keep Sidebar Light
```typescript
// ✅ Good - Lazy load heavy content
const HeavyComponent = dynamic(() => import('./heavy'))

// ❌ Bad - Everything loads upfront
import { HeavyComponent } from './heavy'
```

---

## 📚 Additional Resources

- [shadcn/ui Sidebar Docs](https://ui.shadcn.com/docs/components/sidebar)
- [Notion's Design System](https://www.notion.so/)
- [Sidebar UX Best Practices](../SIDEBAR_UX_ANALYSIS_AND_RECOMMENDATION.md)
- [Implementation Plan](../SIDEBAR_IMPLEMENTATION_COMPLETE_PLAN.md)

---

**That's it! Your sidebar is ready to go.** 🎉

Need help? Check the troubleshooting section or open an issue.
