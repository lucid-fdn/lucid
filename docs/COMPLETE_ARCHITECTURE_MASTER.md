# 🏛️ LucidMerged - Complete Architecture Master Document

> **Last Updated:** October 9, 2025
> 
> **Purpose:** Complete reference for understanding the entire codebase architecture, patterns, and systems

---

## 📑 Table of Contents

1. [System Overview](#system-overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [Database Architecture](#database-architecture)
4. [API Architecture](#api-architecture)
5. [Frontend Architecture](#frontend-architecture)
6. [Key Features](#key-features)
7. [Common Patterns](#common-patterns)
8. [Deployment & Infrastructure](#deployment--infrastructure)

---

## 🌐 System Overview

### Tech Stack

**Frontend:**
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **UI Library:** React 18
- **Styling:** Tailwind CSS + shadcn/ui
- **State Management:** React Context + hooks
- **Forms:** React Hook Form + Zod

**Backend:**
- **Runtime:** Node.js (Next.js API Routes + Server Actions)
- **Database:** PostgreSQL (via Supabase)
- **Authentication:** Privy (Web3 + Social)
- **Email:** Resend
- **File Storage:** Supabase Storage

**Infrastructure:**
- **Hosting:** Vercel
- **Database:** Supabase (PostgreSQL + Real-time)
- **CDN:** Vercel Edge Network
- **Monitoring:** Vercel Analytics

### Architecture Pattern

**Hybrid SSR/CSR:**
```
┌─────────────────────────────────────────┐
│           Client Browser                │
├─────────────────────────────────────────┤
│  React Components (CSR)                 │
│  ↓                                       │
│  Server Components (SSR)                │
│  ↓                                       │
│  Server Actions / API Routes            │
│  ↓                                       │
│  Supabase (PostgreSQL + Storage)        │
└─────────────────────────────────────────┘
```

---

## 🔐 Authentication & Authorization

### Dual-ID System

**Critical Understanding:** Your app uses TWO different ID systems

#### External ID (Privy DID)
```
Format: did:privy:cm7l2311302gcgv1p4155aymd
Purpose: Authentication provider identity
Scope: Privy ecosystem only
Used: JWT tokens, Privy API calls
```

#### Internal ID (Supabase UUID)
```
Format: a1b2c3d4-e5f6-7890-abcd-ef1234567890
Purpose: Database operations
Scope: Entire application
Used: All database queries, RLS policies
```

### Authentication Flow

```typescript
// 1. User logs in → Privy returns JWT with DID
// 2. Server verifies JWT
// 3. Server maps DID → UUID via identity_links
// 4. Server creates session with UUID
// 5. Client receives user with UUID
// 6. All DB operations use UUID

// ✅ CORRECT Pattern
const { user } = useAuth();  // Returns { id: UUID }
await supabase.from('table').eq('user_id', user.id);

// ❌ WRONG Pattern  
const { user } = usePrivy();  // Returns { id: DID }
await supabase.from('table').eq('user_id', user.id);  // FAILS!
```

### Key Files

```
src/lib/auth/
├── session.ts           # DID → UUID mapping + JIT creation
├── cache.ts             # Request-level caching
├── server-utils.ts      # Server auth helpers
├── config.ts            # Auth configuration
└── handle.ts            # Unique handle generation

src/contexts/
└── auth-context.tsx     # Client auth context (uses UUID)
```

### JIT User Creation

```sql
-- On first login:
1. Check identity_links for Privy DID
2. If not found:
   a. Create profile (UUID generated)
   b. Create identity_link (DID → UUID)
   c. Return UUID
3. If found: Return UUID
```

**See:** `docs/AUTH_ID_SYSTEM_AUDIT.md` for complete details

---

## 🗄️ Database Architecture

### Core Tables

#### **profiles** - User profiles
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  avatar_url TEXT,
  bio TEXT,
  homepage TEXT,
  interests TEXT[],
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### **identity_links** - External ID mapping
```sql
CREATE TABLE identity_links (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  provider TEXT NOT NULL,           -- 'privy'
  external_id TEXT NOT NULL,        -- 'did:privy:...'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider, external_id)
);
```

#### **organizations** - Companies/teams
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  bio TEXT,
  homepage TEXT,
  type TEXT DEFAULT 'company',      -- 'company' | 'personal'
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### **organization_members** - Team membership
```sql
CREATE TABLE organization_members (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES profiles(id),
  role TEXT DEFAULT 'member',        -- 'owner' | 'admin' | 'member'
  invited_by UUID REFERENCES profiles(id),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
```

#### **notifications** - User notifications
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  organization_id UUID REFERENCES organizations(id) NULL,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT NOT NULL,               -- 'info' | 'success' | 'warning' | 'error'
  href TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Marketplace Tables

#### **marketplace_assets** - Assets/plugins
```sql
CREATE TABLE marketplace_assets (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  category TEXT,
  price DECIMAL(10,2),
  rating_avg DECIMAL(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  contributor_id UUID REFERENCES profiles(id),
  organization_id UUID REFERENCES organizations(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### **marketplace_bookmarks** - User bookmarks
```sql
CREATE TABLE marketplace_bookmarks (
  user_id UUID REFERENCES profiles(id),
  asset_id UUID REFERENCES marketplace_assets(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, asset_id)
);
```

#### **marketplace_ratings** - Asset ratings
```sql
CREATE TABLE marketplace_ratings (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  asset_id UUID REFERENCES marketplace_assets(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, asset_id)
);
```

### Row Level Security (RLS)

```sql
-- Example: Users can only read/update their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Example: Org members can read org data
CREATE POLICY "Members can read org"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );
```

**See:** `migrations/` folder for all schema migrations

---

## 🚀 API Architecture

### API Routes Pattern

```
src/app/api/
├── auth/                    # Authentication endpoints
│   ├── login/route.ts
│   ├── logout/route.ts
│   └── refresh/route.ts
│
├── (marketing)/             # Public endpoints
│   ├── contact/route.ts
│   ├── waitinglist/route.ts
│   └── newsletter/route.ts
│
├── orgs/[id]/              # Organization endpoints
│   ├── invites/route.ts
│   └── members/route.ts
│
└── v2/marketplace/         # Marketplace v2 API
    ├── search/route.ts
    ├── assets/[id]/
    │   ├── bookmark/route.ts
    │   └── rate/route.ts
    └── contributors/[handle]/
        └── follow/route.ts
```

### API Route Pattern

```typescript
// src/app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const { userId } = await requireServerAuth();
    
    // 2. Parse request
    const body = await req.json();
    
    // 3. Validate (Zod)
    const schema = z.object({ ... });
    const data = schema.parse(body);
    
    // 4. Database operation
    const supabase = createClient(...);
    const { data: result } = await supabase
      .from('table')
      .insert({ ...data, user_id: userId });
    
    // 5. Return response
    return NextResponse.json({ success: true, data: result });
    
  } catch (error) {
    console.error('[api/example] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Server Actions Pattern

```typescript
// src/lib/forms/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';

export async function updateProfileAction(data: ProfileData) {
  try {
    // 1. Auth check
    const { userId } = await requireServerAuth();
    
    // 2. Database operation
    const supabase = createClient(...);
    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', userId);
    
    if (error) throw error;
    
    // 3. Revalidate cache
    revalidatePath('/settings/profile');
    
    // 4. Return success
    return { success: true, message: 'Profile updated' };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

---

## 💻 Frontend Architecture

### Component Structure

```
src/
├── app/                    # App Router pages
│   ├── (marketing)/       # Public pages (no auth)
│   │   ├── page.tsx       # Home
│   │   ├── about/
│   │   └── pricing/
│   │
│   ├── (studio)/          # Protected pages (auth required)
│   │   ├── layout.tsx     # Studio layout with sidebar
│   │   ├── dashboard/
│   │   ├── explore/       # Marketplace
│   │   ├── settings/
│   │   └── workspace/     # NEW: Workspace nav
│   │
│   └── api/               # API routes
│
├── components/            # React components
│   ├── forms/            # Form components
│   ├── navigation/       # Nav components
│   ├── settings/         # Settings pages
│   ├── org/              # Organization components
│   └── interactions/     # Bookmark/Follow/Rate buttons
│
├── contexts/             # React contexts
│   ├── auth-context.tsx
│   └── workspace-context.tsx
│
├── hooks/                # Custom hooks
│   ├── use-auth.ts
│   ├── use-notifications.tsx
│   └── use-marketplace-actions.ts
│
└── lib/                  # Utilities
    ├── auth/            # Auth utilities
    ├── forms/           # Form actions
    ├── marketplace/     # Marketplace logic
    └── notifications.ts  # Notification helpers
```

### Layout Hierarchy

```
RootLayout (app/layout.tsx)
├── Providers (Privy, Theme, etc.)
└── Body
    ├── MarketingLayout (app/(marketing)/layout.tsx)
    │   └── Public pages
    │
    └── StudioLayout (app/(studio)/layout.tsx)
        ├── UnifiedNavbar (top)
        ├── AdaptiveSidebar (left)
        └── Main content
```

### Context Providers

```typescript
// app/providers.tsx
<PrivyProvider>
  <AuthProvider serverAuth={serverAuth}>
    <WorkspaceProvider>
      <NotificationProvider>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </NotificationProvider>
    </WorkspaceProvider>
  </AuthProvider>
</PrivyProvider>
```

### State Management

**Server State:**
- Fetched on server (Server Components)
- Cached with React `cache()`
- Revalidated with `revalidatePath()`

**Client State:**
- React Context for global state
- `useState` for local state
- Custom hooks for shared logic

**Form State:**
- React Hook Form
- Zod validation
- Server Actions for submission

---

## 🎯 Key Features

### 1. Authentication System

**Providers:**
- Email
- Google
- Discord
- Twitter
- Wallet (MetaMask, etc.)

**Features:**
- JIT user creation
- Session caching
- Auto-refresh
- Privy DID → Supabase UUID mapping

**Files:**
- `src/lib/auth/*`
- `src/contexts/auth-context.tsx`
- `docs/AUTH_ID_SYSTEM_AUDIT.md`

### 2. Organization System

**Features:**
- Multi-tenant organizations
- Role-based access (owner/admin/member)
- Team invitations
- Organization switching

**Files:**
- `src/app/api/workspace/*`
- `src/components/org/*`
- `migrations/003_*.sql`

### 3. Notification System

**Features:**
- In-app notifications
- Email notifications
- Organization context tags
- Real-time updates (Supabase subscriptions)
- Mark as read/unread
- Notification preferences

**Files:**
- `src/hooks/use-notifications.tsx`
- `src/components/navigation/nav-notifications.tsx`
- `src/lib/notifications.ts`
- `docs/NOTIFICATION_SYSTEM_ORG_CONTEXT.md`

### 4. Marketplace System

**Features:**
- Asset search & discovery
- Bookmarks
- Ratings & reviews
- Follow contributors/orgs
- AI aggregation (multiple sources)
- Caching & performance optimization

**Files:**
- `src/app/(studio)/explore/*`
- `src/app/api/v2/marketplace/*`
- `src/lib/marketplace/*`
- `src/hooks/use-marketplace-actions.ts`
- `docs/MARKETPLACE_API_V2_IMPLEMENTATION.md`

### 5. Workspace System

**Features:**
- Adaptive sidebar navigation
- Context-aware nav items
- Feature flag controlled (MVP/Pro/Enterprise)
- Workspace switching
- Project-based navigation (future)

**Files:**
- `src/components/navigation/adaptive-sidebar.tsx`
- `src/components/navigation/workspace-nav.tsx`
- `src/config/workspace-nav.ts`
- `docs/SCALABLE_SIDEBAR_IMPLEMENTATION.md`

### 6. Forms System

**Features:**
- Consistent form components
- Form validation (Zod)
- Server actions
- Error handling
- Loading states
- Success messages

**Components:**
- `FormSection` - Card with header
- `FormField` - Individual inputs
- `FormActions` - Submit/cancel buttons
- `FormMessage` - Error/success messages

**Files:**
- `src/components/forms/*`
- `src/lib/forms/*`
- `docs/PHASE_4_FORMS_COMPLETE.md`

---

## 🔧 Common Patterns

### 1. Protected Server Component

```typescript
// app/(studio)/dashboard/page.tsx
import { requireServerAuth } from '@/lib/auth/server-utils';

export default async function DashboardPage() {
  // Requires auth, redirects to /login if not authenticated
  const { user } = await requireServerAuth();
  
  return <Dashboard user={user} />;
}
```

### 2. Protected API Route

```typescript
// app/api/protected/route.ts
import { requireServerAuth } from '@/lib/auth/server-utils';

export async function POST(req: NextRequest) {
  const { userId } = await requireServerAuth();
  // userId is guaranteed to be a UUID
  // ...
}
```

### 3. Form with Server Action

```typescript
// Component
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileSchema } from '@/lib/forms/schemas';
import { updateProfileAction } from '@/lib/forms/actions';

export function ProfileForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(profileSchema),
  });
  
  const onSubmit = async (data) => {
    const result = await updateProfileAction(data);
    if (result.success) {
      // Show success
    }
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormField {...register('name')} error={errors.name?.message} />
      <FormActions loading={loading} />
    </form>
  );
}
```

### 4. Real-time Subscription

```typescript
// Hook with Supabase subscription
useEffect(() => {
  const channel = supabase
    .channel('notifications')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      // Handle real-time update
      refetch();
    })
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}, [userId]);
```

### 5. UUID Validation

```typescript
// Always validate UUIDs before database queries
const isValidUUID = (id: string) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

if (!isValidUUID(userId)) {
  console.error('Invalid UUID:', userId);
  return;
}
```

---

## 🚀 Deployment & Infrastructure

### Environment Variables

```bash
# Privy (Authentication)
NEXT_PUBLIC_PRIVY_APP_ID=
PRIVY_APP_SECRET=

# Supabase (Database)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Resend (Email)
RESEND_API_KEY=

# Optional
SANITY_PROJECT_ID=
SANITY_DATASET=
```

### Deployment Checklist

- [ ] Environment variables set in Vercel
- [ ] Database migrations run
- [ ] RLS policies enabled
- [ ] Storage buckets created
- [ ] DNS configured
- [ ] Email templates tested
- [ ] Analytics configured

### Performance Optimizations

**Server-Side:**
- React `cache()` for request deduplication
- Supabase connection pooling
- Server Components where possible

**Client-Side:**
- Code splitting (dynamic imports)
- Image optimization (Next.js Image)
- Font optimization (next/font)
- Lazy loading components

**Database:**
- Indexes on frequently queried columns
- RLS for security + performance
- Connection pooling

---

## 📚 Key Documentation

### Architecture & Patterns
- `docs/COMPLETE_ARCHITECTURE_MASTER.md` (this file)
- `docs/ROUTING_ARCHITECTURE.md`
- `docs/SCALABLE_SIDEBAR_IMPLEMENTATION.md`

### Authentication
- `docs/AUTH_ID_SYSTEM_AUDIT.md` ⭐ **Critical**
- `docs/SERVER_SIDE_AUTH_IMPLEMENTATION_COMPLETE.md`
- `docs/AUTH_SUPABASE_LINK_EXPLAINED.md`

### Features
- `docs/NOTIFICATION_SYSTEM_ORG_CONTEXT.md`
- `docs/MARKETPLACE_API_V2_IMPLEMENTATION.md`
- `docs/PHASE_4_FORMS_COMPLETE.md`

### Database
- `migrations/README.md`
- `docs/DATABASE_SETUP_GUIDE.md`
- `supabase_*.sql` files

---

## 🎓 Common Mistakes to Avoid

### 1. Using Privy ID in Database Queries ❌

```typescript
// ❌ WRONG
const { user } = usePrivy();
await supabase.from('table').eq('user_id', user.id);  // DID!

// ✅ CORRECT
const { user } = useAuth();
await supabase.from('table').eq('user_id', user.id);  // UUID
```

### 2. Infinite useEffect Loops ❌

```typescript
// ❌ WRONG
useEffect(() => {
  fetchData();
}, [fetchData]);  // fetchData changes every render

// ✅ CORRECT
useEffect(() => {
  fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [user?.id]);  // Stable dependency
```

### 3. Not Validating UUIDs ❌

```typescript
// ❌ WRONG
await supabase.from('table').eq('user_id', userId);

// ✅ CORRECT
if (!isValidUUID(userId)) return;
await supabase.from('table').eq('user_id', userId);
```

### 4. Missing RLS Policies ❌

```sql
-- ❌ WRONG: No RLS
CREATE TABLE sensitive_data (
  id UUID PRIMARY KEY,
  user_id UUID,
  secret TEXT
);

-- ✅ CORRECT: With RLS
ALTER TABLE sensitive_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see own data"
  ON sensitive_data FOR SELECT
  USING (auth.uid() = user_id);
```

---

## 🎯 Quick Reference

### Get Current User
```typescript
// Client-side
const { user } = useAuth();  // UUID

// Server-side
const { user } = await getServerAuth();  // UUID
```

### Database Query
```typescript
const supabase = createClient(...);
const { data } = await supabase
  .from('table')
  .select('*')
  .eq('user_id', userId);  // Always UUID
```

### Create Notification
```typescript
await createNotification({
  user_id: userId,  // UUID
  organization_id: orgId || null,
  title: 'Title',
  message: 'Message',
  type: 'info',
});
```

### Server Action
```typescript
'use server';
const { userId } = await requireServerAuth();  // UUID
// ... do something with userId
```

---

## ✅ Status: Complete

This document provides a comprehensive overview of your entire codebase architecture. Use it as a reference for:
- Understanding system patterns
- Onboarding new developers
- Debugging issues
- Making architectural decisions
- Planning new features

**For specific deep dives, see the linked documentation files.**

🚀 **Happy coding!**
