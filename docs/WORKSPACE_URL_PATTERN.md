# Workspace URL Pattern - Centralized Utilities

## Overview
This document defines the standard pattern for building workspace-scoped URLs that work in both workspace and global contexts. This ensures consistent navigation behavior across the entire app.

## The Problem

When building URLs to workspace-specific pages (like `/[workspace]/ai`), different contexts require different logic:

```tsx
// ❌ Wrong: Breaks on global pages like /explore
<NavItem href={`/${currentWorkspaceSlug}/ai`} />
// → currentWorkspaceSlug is null on /explore → broken link

// ❌ Wrong: Inline fallback logic everywhere (not DRY)
<NavItem href={`/${currentWorkspaceSlug || userWorkspaces[0]?.slug}/ai`} />
// → Duplicated across every component
```

## The Solution - Centralized Utilities

**Location:** `src/lib/workspace/utils.ts`

### Core Functions

#### 1. getEffectiveWorkspaceSlug()
Returns the appropriate workspace slug based on context.

```typescript
import { getEffectiveWorkspaceSlug } from '@/lib/workspace/utils'

const slug = getEffectiveWorkspaceSlug(currentSlug, userWorkspaces)
// In workspace context: returns currentSlug
// On global page: returns userWorkspaces[0].slug
// No workspaces: returns null
```

**Priority Logic:**
1. **Current workspace** (if in workspace context)
2. **First workspace** (fallback for global pages)
3. **null** (if no workspaces available)

#### 2. buildWorkspaceUrl()
Builds complete workspace-scoped URLs.

```typescript
import { buildWorkspaceUrl } from '@/lib/workspace/utils'

const url = buildWorkspaceUrl('/ai', currentSlug, userWorkspaces)
// → '/my-workspace/ai' or null
```

**Usage in Components:**
```tsx
{buildWorkspaceUrl('/ai', currentSlug, userWorkspaces) && (
  <NavItem 
    href={buildWorkspaceUrl('/ai', currentSlug, userWorkspaces)!} 
    icon={Sparkles}
    label="AI Generate"
  />
)}
```

#### 3. isInWorkspaceContext()
Check if currently in a workspace route.

```typescript
import { isInWorkspaceContext } from '@/lib/workspace/utils'

if (isInWorkspaceContext(currentSlug)) {
  // Show workspace-specific UI
}
```

#### 4. getWorkspaceBySlug()
Type-safe workspace lookup.

```typescript
import { getWorkspaceBySlug } from '@/lib/workspace/utils'

const workspace = getWorkspaceBySlug(slug, userWorkspaces)
// Returns workspace object or undefined
```

## Industry Standard Pattern

This pattern matches how leading apps handle workspace navigation:

### Linear Pattern
- Sidebar links visible on all pages
- Clicking "Issues" from settings → goes to your team's issues
- No confusion about missing links

### Notion Pattern
- Database, Calendar always in sidebar
- Works from any page (Settings, Inbox, etc.)
- Defaults to last used workspace

### GitHub Pattern
- Repos, Issues always accessible
- From any GitHub page (Settings, Explore, etc.)
- Defaults to your primary organization

## Usage Examples

### Example 1: Navigation Sidebar
```tsx
// src/components/navigation/workspace-sidebar.tsx
import { buildWorkspaceUrl } from '@/lib/workspace/utils'

export function WorkspaceSidebar({ currentWorkspaceSlug, userWorkspaces }) {
  return (
    <nav>
      {buildWorkspaceUrl('/ai', currentWorkspaceSlug, userWorkspaces) && (
        <NavItem 
          href={buildWorkspaceUrl('/ai', currentWorkspaceSlug, userWorkspaces)!}
          label="AI Generate"
        />
      )}
      
      {buildWorkspaceUrl('/workflows', currentWorkspaceSlug, userWorkspaces) && (
        <NavItem 
          href={buildWorkspaceUrl('/workflows', currentWorkspaceSlug, userWorkspaces)!}
          label="My Apps"
        />
      )}
    </nav>
  )
}
```

### Example 2: Context-Aware Button
```tsx
import { buildWorkspaceUrl } from '@/lib/workspace/utils'

export function CreateButton({ currentSlug, workspaces }) {
  const createUrl = buildWorkspaceUrl('/workflows/new', currentSlug, workspaces)
  
  if (!createUrl) return null // No workspaces available
  
  return <Button href={createUrl}>Create Workflow</Button>
}
```

### Example 3: Conditional UI
```tsx
import { isInWorkspaceContext } from '@/lib/workspace/utils'

export function Layout({ currentSlug }) {
  const inWorkspace = isInWorkspaceContext(currentSlug)
  
  return (
    <div>
      {inWorkspace ? (
        <WorkspaceHeader />
      ) : (
        <GlobalHeader />
      )}
    </div>
  )
}
```

### Example 4: Workspace Lookup
```tsx
import { getWorkspaceBySlug } from '@/lib/workspace/utils'

export function WorkspaceInfo({ slug, workspaces }) {
  const workspace = getWorkspaceBySlug(slug, workspaces)
  
  if (!workspace) return <div>Workspace not found</div>
  
  return <div>{workspace.name}</div>
}
```

## Why This Approach

### ✅ Advantages

**1. DRY (Don't Repeat Yourself)**
- Logic written once
- Used everywhere
- Changes propagate automatically

**2. Type-Safe**
- Full TypeScript support
- Compile-time checks
- IntelliSense in IDE

**3. Testable**
- Pure functions
- Easy to unit test
- Mock-friendly

**4. Maintainable**
- Single source of truth
- Clear API
- Easy to extend

**5. Consistent UX**
- Links always visible (when possible)
- Predictable behavior
- No user confusion

### 🚫 What This Prevents

**Duplicate Logic:**
```tsx
// ❌ Bad: Repeated everywhere
const slug = currentSlug || userWorkspaces[0]?.slug
const slug = currentSlug || userWorkspaces[0]?.slug
const slug = currentSlug || userWorkspaces[0]?.slug
```

**Inconsistent Behavior:**
```tsx
// ❌ Bad: Different fallback logic in different components
Component A: uses currentSlug || userWorkspaces[0]?.slug
Component B: uses currentSlug only
Component C: uses userWorkspaces[0]?.slug always
```

**Breaking Changes:**
```tsx
// ❌ Bad: Changing logic requires updating 20+ files
// If we add "default workspace" feature → update everywhere
```

## Migration Guide

### If You Have Inline Logic

**Before:**
```tsx
{currentWorkspaceSlug && (
  <NavItem href={`/${currentWorkspaceSlug}/ai`} />
)}

// or

{(currentWorkspaceSlug || userWorkspaces[0]?.slug) && (
  <NavItem href={`/${currentWorkspaceSlug || userWorkspaces[0]?.slug}/ai`} />
)}
```

**After:**
```tsx
import { buildWorkspaceUrl } from '@/lib/workspace/utils'

{buildWorkspaceUrl('/ai', currentWorkspaceSlug, userWorkspaces) && (
  <NavItem href={buildWorkspaceUrl('/ai', currentWorkspaceSlug, userWorkspaces)!} />
)}
```

### If You Have Custom Logic

**Before:**
```tsx
const getWorkspaceUrl = () => {
  if (currentWorkspaceSlug) return `/${currentWorkspaceSlug}/workflows`
  if (userWorkspaces[0]) return `/${userWorkspaces[0].slug}/workflows`
  return null
}
```

**After:**
```tsx
import { buildWorkspaceUrl } from '@/lib/workspace/utils'

const url = buildWorkspaceUrl('/workflows', currentWorkspaceSlug, userWorkspaces)
```

## Testing

```typescript
// src/lib/workspace/__tests__/utils.test.ts
import { getEffectiveWorkspaceSlug, buildWorkspaceUrl } from '../utils'

describe('getEffectiveWorkspaceSlug', () => {
  const workspaces = [
    { slug: 'workspace-1' },
    { slug: 'workspace-2' }
  ]
  
  it('returns current slug when available', () => {
    expect(getEffectiveWorkspaceSlug('current', workspaces))
      .toBe('current')
  })
  
  it('returns first workspace when no current slug', () => {
    expect(getEffectiveWorkspaceSlug(null, workspaces))
      .toBe('workspace-1')
  })
  
  it('returns null when no workspaces', () => {
    expect(getEffectiveWorkspaceSlug(null, []))
      .toBe(null)
  })
})

describe('buildWorkspaceUrl', () => {
  it('builds correct URL', () => {
    expect(buildWorkspaceUrl('/ai', 'my-workspace', []))
      .toBe('/my-workspace/ai')
  })
  
  it('handles paths without leading slash', () => {
    expect(buildWorkspaceUrl('ai', 'my-workspace', []))
      .toBe('/my-workspace/ai')
  })
  
  it('returns null when no workspace', () => {
    expect(buildWorkspaceUrl('/ai', null, []))
      .toBe(null)
  })
})
```

## Current Implementations

### ✅ Using Centralized Utilities
- `src/components/navigation/workspace-sidebar.tsx` - Sidebar navigation links

### ⚠️ Should Migrate
- Any component with inline `${currentSlug || workspaces[0]?.slug}` logic
- Custom workspace URL builders
- Duplicate fallback logic

## Future Enhancements

Possible additions to the utility:

```typescript
// 1. Default workspace preference
export function getDefaultWorkspaceSlug(userId: string): string | null

// 2. Recent workspace tracking
export function getMostRecentWorkspaceSlug(userId: string): string | null

// 3. Workspace switching helper
export function switchWorkspace(newSlug: string): void

// 4. Workspace validation
export function isValidWorkspace(slug: string, workspaces: Workspace[]): boolean
```

## Best Practices

### ✅ DO
- Use `buildWorkspaceUrl()` for all workspace links
- Check for null before rendering links
- Use TypeScript for type safety
- Test with null/undefined inputs

### ❌ DON'T
- Build workspace URLs manually
- Duplicate fallback logic
- Hardcode workspace slugs
- Skip null checks

## Related Patterns

- **Service Layer Pattern** (`src/lib/db/index.ts`) - Centralized DB operations
- **Sidebar Layout Pattern** (`docs/SIDEBAR_LAYOUT_PATTERN.md`) - Sidebar overflow fix
- **React Context Pattern** (`docs/REACT_CONTEXT_PATTERNS.md`) - State management

## Questions & Troubleshooting

### Q: Links not showing on global pages?
A: Use `buildWorkspaceUrl()` - it handles global page fallback automatically.

### Q: Should I move global pages under workspace?
A: No - pages like `/explore`, `/help` are truly global. The utility handles both contexts.

### Q: What if user has no workspaces?
A: Functions return `null` - check before rendering:
```tsx
{url && <NavItem href={url} />}
```

### Q: Can I customize the fallback logic?
A: Yes, but consider if the change should be in the utility (benefits everyone) or specific to your component.

---

**Last Updated:** 2025-11-01  
**Pattern Version:** 1.0  
**Applies To:** All workspace-scoped navigation and URL building
