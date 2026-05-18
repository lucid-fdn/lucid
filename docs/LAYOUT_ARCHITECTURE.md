# Layout Architecture - Separation of Concerns

## 🎯 Overview

The application uses **separate layout groups** for different contexts, following industry best practices (Slack, Notion, Linear).

---

## 📁 Structure

```
src/app/
├── (marketing)/          # Public pages - No sidebar
│   ├── layout.tsx       (Marketing navbar + footer)
│   ├── page.tsx         (Landing page)
│   ├── pricing/
│   └── about/
│
├── onboarding/           # User & workspace setup - Actual URL slug!
│   ├── layout.tsx       (Clean navbar only)
│   ├── profile/         (User onboarding)
│   └── workspace/new/   (Workspace creation)
│
└── (app)/                # Main app - With sidebar (route group)
    ├── layout.tsx       (Server: Fetch data)
    ├── app-client-layout.tsx  (Client: Navbar + Sidebar)
    ├── [workspace-slug]/
    ├── dashboard/
    ├── explore/
    └── settings/
```

**Key Difference:**
- `onboarding/` - Actual URL path (`/onboarding/profile`)
- `(app)/` - Route group (no URL segment, just organization)

---

## 🏗️ Layout Groups Explained

### **(marketing)** - Public Pages
**Purpose**: Marketing website  
**Layout**: Clean navbar + footer  
**Sidebar**: None  
**Routes**: `/`, `/pricing`, `/about`, `/blog`

### **onboarding/** - Setup Flows (Actual URL Slug)
**Purpose**: User and workspace onboarding  
**Layout**: Minimal navbar, full-width content  
**Sidebar**: None (focus on onboarding)  
**Routes**: 
- `/onboarding/profile` - User profile setup
- `/onboarding/workspace/new` - Workspace creation

**Why actual slug?**
- ✅ Clear URL structure (`/onboarding/...`)
- ✅ Can add more utility routes later
- ✅ Easier to understand and maintain
- ✅ Industry standard (Slack uses `/get-started`, Linear uses `/onboarding`)

**Why separate layout?**
- ✅ Smaller bundle (no sidebar JS)
- ✅ No distractions during setup
- ✅ Faster load times
- ✅ Cleaner code

### **(app)/** - Main Application (Route Group)
**Purpose**: Workspace-based app  
**Layout**: Navbar + collapsible sidebar  
**Sidebar**: Always available (user can collapse/expand)  
**Routes**:
- `/{workspace-slug}/*` - Workspace pages
- `/dashboard` - Global dashboard
- `/explore` - Marketplace
- `/settings` - User settings

**Why sidebar always in DOM?**
- ✅ Smooth CSS transitions (no mount/unmount)
- ✅ State preservation (scroll, collapsed state)
- ✅ Better accessibility
- ✅ Industry standard pattern

---

## 🎨 User Experience

### **Onboarding Flow:**
```
┌─────────────────────────────────┐
│  Navbar (minimal)              │
├─────────────────────────────────┤
│                                 │
│  [Full-width onboarding form]  │
│   - No sidebar                  │
│   - Clean focus                 │
│                                 │
└─────────────────────────────────┘
```

### **Workspace Flow:**
```
┌─────────────────────────────────┐
│  Navbar (full features)        │
├───────┬─────────────────────────┤
│       │                         │
│ Side  │  Workspace Content      │
│ bar   │  (collapsible)          │
│       │                         │
└───────┴─────────────────────────┘
```

---

## 🔄 Navigation Flow

```
Landing Page (marketing)
    ↓
Sign Up / Login
    ↓
Profile Onboarding (onboarding layout)
    ↓ (if team selected)
Workspace Creation (onboarding layout)
    ↓
Workspace Dashboard (studio layout with sidebar)
```

---

## 💡 Benefits

### **Performance**
- Onboarding pages don't load sidebar code
- Smaller initial bundle
- Faster page loads

### **Maintainability**
- Clear separation of concerns
- No complex conditional logic
- Each layout focused on its purpose

### **User Experience**
- Onboarding: Clean, focused
- Workspace: Full-featured with sidebar
- Smooth transitions

### **Developer Experience**
- Easy to understand
- Easy to extend
- Type-safe
- Follows React best practices

---

## 🏢 Industry Comparison

| App | Onboarding URL | Layout Strategy |
|-----|----------------|-----------------|
| **Slack** | `/get-started` | Actual slug, no sidebar |
| **Notion** | `/setup` | Actual slug, no sidebar |
| **Linear** | `/onboarding` | Actual slug, no sidebar |
| **GitHub** | `/join` | Actual slug, no sidebar |
| **Lucid** ✅ | `/onboarding` | Actual slug, no sidebar |

**Consensus**: Use actual URL slugs for onboarding, not hidden route groups

---

## 📝 Adding New Routes

### **Marketing Page:**
```tsx
// src/app/(marketing)/features/page.tsx
export default function FeaturesPage() {
  return <div>Features content</div>
}
// Automatically uses (marketing)/layout.tsx
```

### **Onboarding Page:**
```tsx
// src/app/onboarding/welcome/page.tsx
export default function WelcomePage() {
  return <div>Welcome onboarding</div>
}
// URL: /onboarding/welcome
// Uses onboarding/layout.tsx (no sidebar)
```

### **App Page:**
```tsx
// src/app/(app)/[workspace-slug]/agents/page.tsx
export default function AgentsPage() {
  return <div>Agents content</div>
}
// URL: /{workspace-slug}/agents
// Uses (app)/layout.tsx (with sidebar)
```

---

## 🎯 Key Takeaways

1. **Actual URL slugs for utility routes** (`/onboarding`)
2. **Route groups for app organization** (`(app)`)
3. **Onboarding has dedicated layout** (no sidebar, clear URL)
4. **App layout always has sidebar** (user controls collapse)
5. **Sidebar always in DOM** (industry standard for smooth UX)
6. **Flexible for future growth** (can add `/admin`, `/api-docs`, etc.)

This architecture follows **industry best practices** and provides the best user experience while keeping the codebase clean and maintainable.
