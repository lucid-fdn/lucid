# 🔄 Headless UI → Shadcn Migration Guide

## ✅ Status: Shadcn Components Installed

### Installed Components
- ✅ sidebar
- ✅ dialog
- ✅ popover
- ✅ dropdown-menu
- ✅ button (already had)
- ✅ separator
- ✅ sheet
- ✅ tooltip
- ✅ input

---

## 📋 Files to Migrate (26 Total)

### Priority 1: High-Impact Components (6 files)

#### 1. `src/components/navbar.tsx` ⭐ CRITICAL
**Current:** Headless UI Popover
**Replace with:** Shadcn Popover

**Changes:**
```typescript
// OLD (Headless UI)
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';

<Popover>
  <PopoverButton>Button</PopoverButton>
  <PopoverPanel>Content</PopoverPanel>
</Popover>

// NEW (Shadcn)
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

<Popover>
  <PopoverTrigger>Button</PopoverTrigger>
  <PopoverContent>Content</PopoverContent>
</Popover>
```

#### 2. `src/components/sidebar.tsx`
**Current:** Headless UI Dialog
**Replace with:** Shadcn Sidebar

**Changes:**
```typescript
// OLD
import * as Headless from "@headlessui/react";

// NEW  
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
```

#### 3. `src/components/sidebar-layout.tsx`
**Similar to sidebar.tsx**

#### 4. `src/components/stacked-layout.tsx`
**Similar to sidebar.tsx**

#### 5. `src/components/dialog.tsx`
**Current:** Headless UI Dialog
**Replace with:** Shadcn Dialog

**Changes:**
```typescript
// OLD
import * as Headless from '@headlessui/react'

// NEW
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
```

#### 6. `src/components/dropdown.tsx`
**Current:** Headless UI Menu
**Replace with:** Shadcn DropdownMenu

**Changes:**
```typescript
// OLD
import * as Headless from '@headlessui/react'

// NEW
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
```

---

### Priority 2: Form Components (7 files)

#### 7. `src/components/input.tsx`
**Note:** Already updated by Shadcn CLI

#### 8. `src/components/select.tsx`
**Install:** `npx shadcn@latest add select`
```typescript
// NEW
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
```

#### 9. `src/components/listbox.tsx`
**Replace with:** Shadcn Select (same as above)

#### 10. `src/components/radio.tsx`
**Install:** `npx shadcn@latest add radio-group`
```typescript
// NEW
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
```

#### 11. `src/components/checkbox.tsx`
**Install:** `npx shadcn@latest add checkbox`
```typescript
// NEW
import { Checkbox } from "@/components/ui/checkbox"
```

#### 12. `src/components/switch.tsx`
**Install:** `npx shadcn@latest add switch`
```typescript
// NEW
import { Switch } from "@/components/ui/switch"
```

#### 13. `src/components/textarea.tsx`
**Install:** `npx shadcn@latest add textarea`
```typescript
// NEW
import { Textarea } from "@/components/ui/textarea"
```

---

### Priority 3: Other Components (13 files)

#### 14-26. Remaining Files
- `src/components/button.tsx` ✅ Already Shadcn
- `src/components/link.tsx` - Keep as-is (uses Next Link)
- `src/components/fieldset.tsx` - Minimal Headless UI usage
- `src/components/badge.tsx` ✅ Already Shadcn
- `src/components/avatar.tsx` - Install Shadcn Avatar
- `src/components/alert.tsx` - Install Shadcn Alert
- `src/components/testimonials.tsx` - Migrate Tab components
- Context files (notification-context, etc.) - Use Transition from Framer Motion

---

## 🚀 Migration Strategy

### Phase 1: Install Missing Components
```bash
cd apps/web
npx shadcn@latest add select radio-group checkbox switch textarea avatar alert tabs --yes
```

### Phase 2: Migrate High-Priority Files
1. Start with `navbar.tsx` (most visible)
2. Then `sidebar.tsx` (complex layout)
3. Then `dialog.tsx` and `dropdown.tsx`

### Phase 3: Migrate Form Components
All at once since they're similar patterns

### Phase 4: Migrate Remaining Files
Low-risk, minimal changes

### Phase 5: Remove Headless UI
```bash
npm uninstall @headlessui/react
```

---

## 📝 Migration Patterns

### Pattern 1: Popover Migration
```typescript
// BEFORE (Headless UI)
<Popover className="relative">
  <PopoverButton>
    Click me
  </PopoverButton>
  <PopoverPanel className="absolute z-10">
    <div>Panel content</div>
  </PopoverPanel>
</Popover>

// AFTER (Shadcn)
<Popover>
  <PopoverTrigger asChild>
    <Button>Click me</Button>
  </PopoverTrigger>
  <PopoverContent>
    <div>Panel content</div>
  </PopoverContent>
</Popover>
```

### Pattern 2: Dialog Migration
```typescript
// BEFORE
<Dialog open={isOpen} onClose={setIsOpen}>
  <DialogPanel>
    <DialogTitle>Title</DialogTitle>
    <div>Content</div>
  </DialogPanel>
</Dialog>

// AFTER
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    <div>Content</div>
  </DialogContent>
</Dialog>
```

### Pattern 3: Menu/Dropdown Migration
```typescript
// BEFORE
<Menu>
  <MenuButton>Options</MenuButton>
  <MenuItems>
    <MenuItem>
      {({ active }) => (
        <button className={active ? 'bg-blue-500' : ''}>
          Edit
        </button>
      )}
    </MenuItem>
  </MenuItems>
</Menu>

// AFTER
<DropdownMenu>
  <DropdownMenuTrigger>Options</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>
      Edit
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## ⚠️ Key Differences

### 1. Trigger Components
- **Headless UI:** `<PopoverButton>`, `<MenuButton>`
- **Shadcn:** `<PopoverTrigger>`, `<DropdownMenuTrigger>` (often needs `asChild`)

### 2. Content Containers
- **Headless UI:** `<PopoverPanel>`, `<MenuItems>`
- **Shadcn:** `<PopoverContent>`, `<DropdownMenuContent>`

### 3. State Management
- **Headless UI:** Managed internally
- **Shadcn:** More control with `open` and `onOpenChange` props

### 4. Render Props
- **Headless UI:** Uses render props `{({ active }) => ...}`
- **Shadcn:** No render props, uses CSS classes

---

## 🧪 Testing Checklist

After each migration:
- [ ] Component renders correctly
- [ ] Keyboard navigation works (Tab, Enter, Esc)
- [ ] Screen reader announces correctly
- [ ] Dark mode works
- [ ] Mobile responsive
- [ ] Animations smooth
- [ ] No console errors

---

## 📊 Progress Tracker

### Components Installed ✅
- [x] sidebar
- [x] dialog
- [x] popover
- [x] dropdown-menu
- [ ] select
- [ ] radio-group
- [ ] checkbox
- [ ] switch
- [ ] textarea
- [ ] avatar
- [ ] alert
- [ ] tabs

### Files Migrated
- [ ] navbar.tsx (0/1)
- [ ] sidebar.tsx (0/1)
- [ ] sidebar-layout.tsx (0/1)
- [ ] stacked-layout.tsx (0/1)
- [ ] dialog.tsx (0/1)
- [ ] dropdown.tsx (0/1)
- [ ] select.tsx (0/1)
- [ ] listbox.tsx (0/1)
- [ ] radio.tsx (0/1)
- [ ] checkbox.tsx (0/1)
- [ ] switch.tsx (0/1)
- [ ] textarea.tsx (0/1)
- [ ] Other 14 files (0/14)

**Total Progress: 0/26 files (0%)**

---

## 🎯 Quick Start

### Option A: Auto-migrate (Recommended)
Let AI assistant migrate files automatically using this guide

### Option B: Manual Migration
1. Install missing components
2. Follow patterns above
3. Test each component
4. Remove Headless UI when done

### Option C: Gradual Migration
1. Keep both libraries temporarily
2. Migrate one component at a time
3. Test thoroughly
4. Remove Headless UI last

---

## 💡 Tips

1. **Start with Popover** - It's used in navbar (most visible)
2. **Test after each file** - Don't migrate everything at once
3. **Keep Headless UI** until all files migrated
4. **Use Git** - Commit after each successful migration
5. **Check Dark Mode** - Shadcn components need dark mode classes

---

## 🚀 Ready to Start?

All Shadcn components are installed and ready!
Next step: Migrate `navbar.tsx` (the most visible component)
