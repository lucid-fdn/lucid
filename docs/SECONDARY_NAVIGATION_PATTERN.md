# Secondary Navigation Pattern - Industry Standards

## Overview
After analyzing major platforms (Supabase, GitHub, Vercel, Notion), the **section-specific layout pattern** is the industry standard for secondary navigation.

## Industry Examples

### 1. **Supabase Settings**
```
Structure:
/dashboard → No secondary nav
/settings → Secondary nav appears
  /settings/general → Same secondary nav
  /settings/database → Same secondary nav
  /settings/auth → Same secondary nav
```

### 2. **GitHub Repository Settings**
```
Structure:
/repo → No secondary nav
/repo/settings → Secondary nav appears
  /repo/settings/general → Same secondary nav
  /repo/settings/branches → Same secondary nav
  /repo/settings/security → Same secondary nav
```

### 3. **Vercel Project Settings**
```
Structure:
/project → No secondary nav
/project/settings → Secondary nav appears
  /project/settings/general → Same secondary nav
  /project/settings/domains → Same secondary nav
  /project/settings/env-vars → Same secondary nav
```

## The Pattern

### ✅ Correct: Section-Specific Layout
```typescript
// Root layout - NO secondary nav
app/(studio)/layout.tsx
  - Main sidebar only
  - Content area

// Settings layout - HAS secondary nav
app/(studio)/settings/layout.tsx
  - Wraps all /settings/* routes
  - Secondary nav specific to settings
  - Only visible within /settings section
```

### ❌ Incorrect: Root Layout
```typescript
// DON'T put secondary nav here
app/(studio)/layout.tsx
  - Main sidebar
  - Secondary sidebar (conditional)
  - Content area
```

## Why Section-Specific?

### 1. **Context Relevance**
- Settings pages need settings navigation
- Dashboard pages don't need settings navigation
- Each section has different nav items

### 2. **Code Organization**
- Each section owns its navigation
- Easy to add new sections
- No complex conditional logic in root

### 3. **Performance**
- Secondary nav only loads when needed
- Smaller bundle for routes that don't need it
- Better code splitting

### 4. **Flexibility**
- Different sections can have different nav structures
- Project settings vs User settings vs Org settings
- Each can be customized independently

## Implementation

### Current Structure (✅ Correct)
```
src/
├── app/(studio)/
│   ├── layout.tsx              # Main layout (no secondary nav)
│   ├── dashboard/
│   │   └── page.tsx            # No secondary nav
│   └── settings/
│       ├── layout.tsx          # Settings layout WITH secondary nav
│       ├── profile/page.tsx
│       ├── account/page.tsx
│       └── notifications/page.tsx
```

### Layout Code
```typescript
// settings/layout.tsx
export default function SettingsLayout({ children }) {
  return (
    <SecondaryNavLayout>
      <SecondaryNav 
        title="Settings" 
        sections={settingsNavigation}
      />
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </SecondaryNavLayout>
  )
}
```

## Responsive Behavior

### Desktop (≥768px)
```
┌─────────────┬──────────────┬───────────────────┐
│ Main        │ Secondary    │ Content           │
│ Sidebar     │ Nav          │                   │
│             │              │                   │
│ Dashboard   │ Settings     │ Notification      │
│ Chat        │              │ Preferences       │
│ Settings    │ Profile      │                   │
│             │ Account      │                   │
│             │ Notifs   →   │                   │
└─────────────┴──────────────┴───────────────────┘
```

### Mobile (<768px)
```
┌─────────────────────────────────────────────┐
│ Main Sidebar (collapsed/drawer)             │
├─────────────────────────────────────────────┤
│ [Settings ▼] ← Drawer trigger               │
├─────────────────────────────────────────────┤
│                                             │
│ Content                                     │
│                                             │
└─────────────────────────────────────────────┘

Tap trigger → Drawer slides up from bottom:
┌─────────────────────────────────────────────┐
│ Content (dimmed)                            │
│                                             │
├─────────────────────────────────────────────┤
│ ═════ (handle)                              │
│                                             │
│ Settings                                    │
│                                             │
│ PERSONAL SETTINGS                           │
│ • Profile                                   │
│ • Account                                   │
│ • Notifications                             │
└─────────────────────────────────────────────┘
```

## When to Add Secondary Nav

Add secondary nav to a section when:
- ✅ Section has 3+ subsections/pages
- ✅ Subsections are conceptually related
- ✅ Users need to navigate between subsections frequently
- ✅ Section has complex hierarchy (Categories → Items)

Don't add secondary nav when:
- ❌ Section has only 1-2 pages
- ❌ Pages are accessed independently
- ❌ Navigation is better handled by main sidebar
- ❌ Section is simple/temporary

## Examples of Where to Use

### Good Candidates
- `/settings/*` - User/org settings (current implementation ✅)
- `/project/[id]/*` - Project-specific pages
- `/docs/*` - Documentation with categories
- `/admin/*` - Admin panel sections

### Not Necessary
- `/dashboard` - Single page
- `/chat/[id]` - Individual chat view
- `/profile/[username]` - User profile view

## Conclusion

**Our current implementation is correct!** ✅

The secondary navigation in `app/(studio)/settings/layout.tsx` follows industry best practices:
- Section-specific (only in /settings)
- Responsive (sidebar on desktop, drawer on mobile)
- Reusable component
- Clean separation of concerns

This is exactly how Supabase, GitHub, Vercel, and other major platforms structure their secondary navigation.
