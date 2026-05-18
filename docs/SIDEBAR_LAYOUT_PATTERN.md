# Sidebar Layout Pattern - Preventing Horizontal Overflow

## Overview
This document defines the standard pattern for implementing sidebar layouts without horizontal overflow issues. Follow this pattern for **any layout that uses a sidebar**.

## The Problem
When using shadcn's `SidebarProvider` + `Sidebar`, content can overflow horizontally if not properly constrained, causing:
- Horizontal scrollbar
- Hidden content on the right
- Poor user experience

## The Solution - Required Pattern

### 1. Component Structure
```tsx
import { SidebarProvider, SidebarInset } from "@/ui/components/sidebar"

<SidebarProvider defaultOpen={defaultOpen}>
  {/* Navbar (optional) */}
  <UnifiedNavbar />
  
  {/* Sidebar */}
  <Sidebar>
    {/* Sidebar content */}
  </Sidebar>
  
  {/* Content - CRITICAL: Must use SidebarInset */}
  <SidebarInset className="overflow-x-hidden">
    <div className="flex h-full w-full flex-col">
      <div className="flex flex-1 flex-col gap-4 p-4 w-full max-w-full overflow-x-hidden">
        {children}
      </div>
    </div>
  </SidebarInset>
</SidebarProvider>
```

### 2. Critical Classes Explained

| Class | Element | Purpose |
|-------|---------|---------|
| `overflow-x-hidden` | `SidebarInset` | Prevents content from overflowing horizontally |
| `w-full` | Content divs | Forces content to use 100% of available space |
| `max-w-full` | Content divs | Prevents content from exceeding container |
| `overflow-x-hidden` | Inner content div | Additional safety net for child overflow |

### 3. CSS That Applies Automatically
When you use `SidebarInset`, shadcn applies these automatically:
- Adjusts `margin-left` based on sidebar state
- Handles transitions when sidebar collapses/expands
- Manages responsive breakpoints

## Current Implementations

### ✅ Has Sidebar (Pattern Applied)
- `src/app/(app)/app-client-layout.tsx` - Main app layout with workspace sidebar

### ❌ No Sidebar (Pattern Not Needed)
- `src/app/(marketing)/layout.tsx` - Marketing pages
- `src/app/(workflow)/layout.tsx` - Workflow root (might add sidebar later)
- `src/app/layout.tsx` - Root layout

## How to Apply Pattern to New Layouts

### Step 1: Import Required Components
```tsx
import { SidebarProvider, SidebarInset } from "@/ui/components/sidebar"
```

### Step 2: Wrap Content with SidebarProvider
```tsx
<SidebarProvider defaultOpen={true}>
  {/* Your layout */}
</SidebarProvider>
```

### Step 3: Add Sidebar Component
```tsx
<Sidebar>
  {/* Sidebar navigation items */}
</Sidebar>
```

### Step 4: Wrap Page Content with SidebarInset
```tsx
<SidebarInset className="overflow-x-hidden">
  <div className="flex h-full w-full flex-col">
    <div className="flex flex-1 flex-col gap-4 p-4 w-full max-w-full overflow-x-hidden">
      {children}
    </div>
  </div>
</SidebarInset>
```

## Common Mistakes to Avoid

### ❌ DON'T: Skip SidebarInset
```tsx
{/* WRONG - Content will overflow */}
<SidebarProvider>
  <Sidebar />
  <div className="w-full">
    {children}
  </div>
</SidebarProvider>
```

### ❌ DON'T: Add overflow-x-hidden to html/body
```tsx
{/* WRONG - Just hides the problem */}
<html className="overflow-x-hidden">
  <body className="overflow-x-hidden">
```

### ❌ DON'T: Forget width constraints
```tsx
{/* WRONG - Content can exceed bounds */}
<SidebarInset>
  <div>
    {children}
  </div>
</SidebarInset>
```

### ✅ DO: Use Complete Pattern
```tsx
{/* CORRECT - Proper constraints */}
<SidebarInset className="overflow-x-hidden">
  <div className="flex h-full w-full flex-col">
    <div className="flex flex-1 flex-col gap-4 p-4 w-full max-w-full overflow-x-hidden">
      {children}
    </div>
  </div>
</SidebarInset>
```

## Testing Checklist

When implementing sidebar layouts, verify:
- [ ] No horizontal scrollbar at any viewport size
- [ ] All content visible (nothing hidden off-screen)
- [ ] Sidebar collapses/expands smoothly
- [ ] Content width adjusts automatically
- [ ] Works on mobile, tablet, desktop
- [ ] Tested with sidebar expanded
- [ ] Tested with sidebar collapsed

## Industry Standards

This pattern follows best practices from:
- **shadcn/ui documentation** - Official SidebarInset pattern
- **Linear** - Sidebar layout implementation
- **Vercel Dashboard** - Content containment
- **Stripe Dashboard** - Sidebar width management

## Future Considerations

If you need to add a sidebar to:
- **Workflow layouts** - Apply this pattern
- **Settings pages** - Apply this pattern
- **Admin interfaces** - Apply this pattern
- **Any new feature with navigation** - Apply this pattern

## Reference Implementation

For a complete working example, see:
`src/app/(app)/app-client-layout.tsx`

This is the canonical implementation of the pattern in our codebase.

## Questions?

If you encounter overflow issues with sidebars:
1. Check you're using `SidebarInset` (not just a div)
2. Verify all required classes are present
3. Test sidebar collapse/expand
4. Review this document for the complete pattern
5. Reference the working implementation

---

**Last Updated:** 2025-11-01  
**Pattern Version:** 1.0  
**Applies To:** All layouts using shadcn Sidebar component
